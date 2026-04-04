const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const prisma = require('../lib/prisma');

const BATCH_SIZE = 5000;
const CSV_FILE_PATH = path.join(__dirname, '../../india_villages_clean.csv');

async function importData() {
  console.log("🚀 Starting data import process...");

  if (!fs.existsSync(CSV_FILE_PATH)) {
    console.error("❌ CSV file not found at:", CSV_FILE_PATH);
    process.exit(1);
  }

  // Ensure India exists
  let country = await prisma.country.findFirst({ where: { name: 'India' } });
  if (!country) {
    country = await prisma.country.create({ data: { name: 'India' } });
    console.log("✅ Created Country: India");
  }

  const statesMap = new Map();
  const districtsMap = new Map();
  const subDistrictsMap = new Map();
  
  console.log("⏳ Pass 1: Scanning for unique States, Districts, and Sub-Districts...");
  
  await new Promise((resolve, reject) => {
    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv())
      .on('data', (row) => {
        const stateCode = parseInt(row['MDDS STC'], 10);
        const districtCode = parseInt(row['MDDS DTC'], 10);
        const subDistrictCode = parseInt(row['MDDS Sub_DT'], 10);

        if (!isNaN(stateCode) && !statesMap.has(stateCode)) {
          statesMap.set(stateCode, { name: row['STATE NAME'].trim(), code: stateCode, countryId: country.id });
        }
        
        if (!isNaN(districtCode) && !districtsMap.has(districtCode)) {
          districtsMap.set(districtCode, { name: row['DISTRICT NAME'].trim(), code: districtCode, stateCode });
        }

        if (!isNaN(subDistrictCode) && !subDistrictsMap.has(subDistrictCode)) {
          subDistrictsMap.set(subDistrictCode, { name: row['SUB-DISTRICT NAME'].trim(), code: subDistrictCode, districtCode });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`📊 Found ${statesMap.size} States, ${districtsMap.size} Districts, and ${subDistrictsMap.size} Sub-Districts.`);
  
  // Insert States
  console.log("💾 Saving States...");
  for (const state of statesMap.values()) {
    await prisma.state.upsert({
      where: { code: state.code },
      update: {},
      create: { name: state.name, code: state.code, countryId: state.countryId }
    });
  }

  // Re-fetch states to map codes to IDs
  const stateRecords = await prisma.state.findMany();
  const stateCodeToId = new Map(stateRecords.map(s => [s.code, s.id]));

  // Insert Districts
  console.log("💾 Saving Districts...");
  for (const dist of districtsMap.values()) {
    const stateId = stateCodeToId.get(dist.stateCode);
    if (!stateId) continue;
    await prisma.district.upsert({
      where: { code: dist.code },
      update: {},
      create: { name: dist.name, code: dist.code, stateId }
    });
  }

  // Re-fetch districts to map codes to IDs
  const districtRecords = await prisma.district.findMany();
  const districtCodeToId = new Map(districtRecords.map(d => [d.code, d.id]));

  // Insert SubDistricts
  console.log("💾 Saving Sub-Districts...");
  for (const sub of subDistrictsMap.values()) {
    const districtId = districtCodeToId.get(sub.districtCode);
    if (!districtId) continue;
    await prisma.subDistrict.upsert({
      where: { code: sub.code },
      update: {},
      create: { name: sub.name, code: sub.code, districtId }
    });
  }

  // Re-fetch sub-districts to map codes to IDs
  const subDistrictRecords = await prisma.subDistrict.findMany();
  const subDistrictCodeToId = new Map(subDistrictRecords.map(sd => [sd.code, sd.id]));

  console.log("⏳ Pass 2: Inserting Villages in Batches of", BATCH_SIZE);
  
  let villageBatch = [];
  let totalVillagesInserted = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv())
      .on('data', async (row) => {
        const villageCode = parseInt(row['MDDS PLCN'], 10);
        const subDistrictCode = parseInt(row['MDDS Sub_DT'], 10);
        
        if (isNaN(villageCode) || isNaN(subDistrictCode)) return;

        const subDistrictId = subDistrictCodeToId.get(subDistrictCode);
        if (!subDistrictId) return;

        villageBatch.push({
          name: row['Area Name'].trim(),
          code: villageCode,
          subDistrictId
        });

        if (villageBatch.length >= BATCH_SIZE) {
          // Pause stream temporarily while writing batch
          const tempBatch = [...villageBatch];
          villageBatch = [];
          
          await prisma.village.createMany({
            data: tempBatch,
            skipDuplicates: true // Skip if already imported
          }).then(result => {
             totalVillagesInserted += result.count;
             console.log(`✅ Inserted ${totalVillagesInserted} villages so far...`);
          }).catch(err => {
             console.error("Batch insert error for a chunk. Continuing...", err.message);
          });
        }
      })
      .on('end', async () => {
        if (villageBatch.length > 0) {
          await prisma.village.createMany({
            data: villageBatch,
            skipDuplicates: true
          });
          totalVillagesInserted += villageBatch.length;
        }
        resolve();
      })
      .on('error', reject);
  });

  console.log(`🎉 Import completed! Successfully processed regions and ${totalVillagesInserted} villages.`);
  process.exit(0);
}

importData().catch(err => {
  console.error("❌ Fatal Import Error:", err);
  process.exit(1);
});
