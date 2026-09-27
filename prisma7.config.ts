/// <reference types="node" />
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prisma CLI (migrate, db pull, studio) uses a direct connection.
    // Runtime queries use DATABASE_URL through the pg driver adapter in src/lib/prisma.ts.
    url: process.env["DIRECT_URL"],
  },
});
