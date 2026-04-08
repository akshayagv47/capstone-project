const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const dotenv = require("dotenv");
const { resolveDatabaseUrl, hasPlaceholderPassword } = require("../lib/databaseUrl");
const prisma = require("../lib/prisma");

dotenv.config();

const BATCH_SIZE = 2000;
const METADATA_BATCH_SIZE = 1000;
const CSV_FILE_PATH = path.join(__dirname, "../../india_villages_clean.csv");

const RETRYABLE_CODES = new Set(["P1001", "P1017"]);
const MAX_RETRIES = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableDbError(error) {
  if (!error) {
    return false;
  }

  if (RETRYABLE_CODES.has(error.code)) {
    return true;
  }

  const message = String(error.message || "");
  return /Can't reach database server|Connection terminated|timed out|ECONNRESET/i.test(message);
}

async function withRetry(operationName, operation, attempt = 1) {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryableDbError(error) || attempt >= MAX_RETRIES) {
      throw error;
    }

    const waitMs = 1500 * attempt;
    console.warn(
      `⚠️ ${operationName} failed with transient DB error (${error.code || "unknown"}). Retrying ${attempt}/${MAX_RETRIES - 1} in ${waitMs}ms...`
    );

    await prisma.$disconnect().catch(() => {});
    await sleep(waitMs);
    await prisma.$connect().catch(() => {});

    return withRetry(operationName, operation, attempt + 1);
  }
}

async function createManyInChunks(modelName, records, chunkSize, label) {
  if (!records.length) {
    return 0;
  }

  let inserted = 0;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const result = await withRetry(`${label} chunk ${Math.floor(i / chunkSize) + 1}`, () =>
      prisma[modelName].createMany({
        data: chunk,
        skipDuplicates: true,
      })
    );

    inserted += result.count || 0;
  }

  return inserted;
}

async function importData() {
  console.log("🚀 Starting data import process...");

  if (!fs.existsSync(CSV_FILE_PATH)) {
    throw new Error(`CSV file not found at: ${CSV_FILE_PATH}`);
  }

  const resolvedDb = resolveDatabaseUrl();
  const dbUrl = resolvedDb.url;
  if (!dbUrl) {
    throw new Error("DATABASE_URL or DATABASE_URL_UNPOOLED is missing. Set it in .env before running seed.");
  }

  if (hasPlaceholderPassword(dbUrl)) {
    throw new Error(
      `${resolvedDb.source || "Database URL"} still contains YOUR_PASSWORD placeholder. Replace it with actual Neon password.`
    );
  }

  await withRetry("prisma connect", () => prisma.$connect());

  // Ensure India exists
  let country = await withRetry("find country India", () => prisma.country.findFirst({ where: { name: "India" } }));
  if (!country) {
    country = await withRetry("create country India", () => prisma.country.create({ data: { name: "India" } }));
    console.log("✅ Created Country: India");
  }

  const statesMap = new Map();
  const districtsMap = new Map();
  const subDistrictsMap = new Map();

  console.log("⏳ Pass 1: Scanning for unique States, Districts, and Sub-Districts...");

  await new Promise((resolve, reject) => {
    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv())
      .on("data", (row) => {
        const stateCode = parseInt(row["MDDS STC"], 10);
        const districtCode = parseInt(row["MDDS DTC"], 10);
        const subDistrictCode = parseInt(row["MDDS Sub_DT"], 10);

        if (!isNaN(stateCode) && !statesMap.has(stateCode)) {
          statesMap.set(stateCode, {
            name: row["STATE NAME"].trim(),
            code: stateCode,
            countryId: country.id,
          });
        }

        if (!isNaN(districtCode) && !districtsMap.has(districtCode)) {
          districtsMap.set(districtCode, {
            name: row["DISTRICT NAME"].trim(),
            code: districtCode,
            stateCode,
          });
        }

        if (!isNaN(subDistrictCode) && !subDistrictsMap.has(subDistrictCode)) {
          subDistrictsMap.set(subDistrictCode, {
            name: row["SUB-DISTRICT NAME"].trim(),
            code: subDistrictCode,
            districtCode,
          });
        }
      })
      .on("end", resolve)
      .on("error", reject);
  });

  console.log(`📊 Found ${statesMap.size} States, ${districtsMap.size} Districts, and ${subDistrictsMap.size} Sub-Districts.`);

  // Insert States
  console.log("💾 Saving States...");
  const statesData = Array.from(statesMap.values());
  await createManyInChunks("state", statesData, METADATA_BATCH_SIZE, "States");

  // Re-fetch states to map codes to IDs
  const stateRecords = await withRetry("fetch states", () => prisma.state.findMany({ select: { id: true, code: true } }));
  const stateCodeToId = new Map(stateRecords.map((state) => [state.code, state.id]));

  // Insert Districts
  console.log("💾 Saving Districts...");
  const districtsData = [];
  for (const dist of districtsMap.values()) {
    const stateId = stateCodeToId.get(dist.stateCode);
    if (!stateId) {
      continue;
    }

    districtsData.push({
      name: dist.name,
      code: dist.code,
      stateId,
    });
  }
  await createManyInChunks("district", districtsData, METADATA_BATCH_SIZE, "Districts");

  // Re-fetch districts to map codes to IDs
  const districtRecords = await withRetry("fetch districts", () =>
    prisma.district.findMany({ select: { id: true, code: true } })
  );
  const districtCodeToId = new Map(districtRecords.map((district) => [district.code, district.id]));

  // Insert SubDistricts
  console.log("💾 Saving Sub-Districts...");
  const subDistrictsData = [];
  for (const sub of subDistrictsMap.values()) {
    const districtId = districtCodeToId.get(sub.districtCode);
    if (!districtId) {
      continue;
    }

    subDistrictsData.push({
      name: sub.name,
      code: sub.code,
      districtId,
    });
  }
  await createManyInChunks("subDistrict", subDistrictsData, METADATA_BATCH_SIZE, "SubDistricts");

  // Re-fetch sub-districts to map codes to IDs
  const subDistrictRecords = await withRetry("fetch sub-districts", () =>
    prisma.subDistrict.findMany({ select: { id: true, code: true } })
  );
  const subDistrictCodeToId = new Map(subDistrictRecords.map((subDistrict) => [subDistrict.code, subDistrict.id]));

  console.log("⏳ Pass 2: Inserting Villages in Batches of", BATCH_SIZE);

  let villageBatch = [];
  let totalVillagesInserted = 0;

  async function flushVillageBatch() {
    if (!villageBatch.length) {
      return;
    }

    const currentBatch = villageBatch;
    villageBatch = [];

    const result = await withRetry("village batch insert", () =>
      prisma.village.createMany({
        data: currentBatch,
        skipDuplicates: true,
      })
    );

    totalVillagesInserted += result.count || 0;
    console.log(`✅ Inserted ${totalVillagesInserted} villages so far...`);
  }

  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(CSV_FILE_PATH).pipe(csv());

    stream.on("data", (row) => {
      try {
        const villageCode = parseInt(row["MDDS PLCN"], 10);
        const subDistrictCode = parseInt(row["MDDS Sub_DT"], 10);

        if (isNaN(villageCode) || isNaN(subDistrictCode)) {
          return;
        }

        const subDistrictId = subDistrictCodeToId.get(subDistrictCode);
        if (!subDistrictId) {
          return;
        }

        villageBatch.push({
          name: row["Area Name"].trim(),
          code: villageCode,
          subDistrictId,
        });

        if (villageBatch.length >= BATCH_SIZE) {
          stream.pause();
          flushVillageBatch()
            .then(() => stream.resume())
            .catch((error) => stream.destroy(error));
        }
      } catch (error) {
        stream.destroy(error);
      }
    });

    stream.on("end", () => {
      flushVillageBatch().then(resolve).catch(reject);
    });

    stream.on("error", reject);
  });

  console.log(`🎉 Import completed! Successfully processed regions and ${totalVillagesInserted} villages.`);
}

importData()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("❌ Fatal Import Error:", error);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
