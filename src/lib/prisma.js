const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");
const { resolveDatabaseUrl, hasPlaceholderPassword } = require("./databaseUrl");

dotenv.config();

const resolvedDb = resolveDatabaseUrl();
const databaseUrl = resolvedDb.url;

if (!databaseUrl) {
	throw new Error("DATABASE_URL or DATABASE_URL_UNPOOLED is required");
}

if (hasPlaceholderPassword(databaseUrl)) {
	throw new Error(
		`Database URL from ${resolvedDb.source || "env"} still contains YOUR_PASSWORD placeholder. Replace it with your actual Neon password.`
	);
}

const prisma = new PrismaClient({
	datasources: {
		db: {
			url: databaseUrl,
		},
	},
});

module.exports = prisma;
