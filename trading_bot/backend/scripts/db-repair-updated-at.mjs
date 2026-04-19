#!/usr/bin/env node

import pg from "pg";

const { Client } = pg;

function quoteIdentifier(value) {
  return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const { rows } = await client.query(`
      SELECT
        tables.table_name,
        EXISTS (
          SELECT 1
          FROM information_schema.columns created_columns
          WHERE created_columns.table_schema = tables.table_schema
            AND created_columns.table_name = tables.table_name
            AND created_columns.column_name = 'createdAt'
        ) AS has_created_at
      FROM information_schema.tables tables
      INNER JOIN information_schema.columns updated_columns
        ON updated_columns.table_schema = tables.table_schema
       AND updated_columns.table_name = tables.table_name
      WHERE tables.table_schema = 'public'
        AND tables.table_type = 'BASE TABLE'
        AND updated_columns.column_name = 'updatedAt'
      ORDER BY tables.table_name
    `);

    let repairedRows = 0;
    const repairedTables = [];

    for (const row of rows) {
      const tableName = row.table_name;
      const hasCreatedAt = row.has_created_at === true;
      const tableRef = `${quoteIdentifier("public")}.${quoteIdentifier(tableName)}`;
      const updateSql = hasCreatedAt
        ? `UPDATE ${tableRef} SET "updatedAt" = COALESCE("updatedAt", "createdAt", NOW()) WHERE "updatedAt" IS NULL`
        : `UPDATE ${tableRef} SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL`;
      const result = await client.query(updateSql);
      const changed = Number(result.rowCount ?? 0);
      if (changed > 0) {
        repairedRows += changed;
        repairedTables.push({ tableName, changed });
      }
    }

    if (repairedTables.length === 0) {
      console.log("[db-repair-updated-at] no legacy NULL updatedAt rows found");
      return;
    }

    for (const repaired of repairedTables) {
      console.log(`[db-repair-updated-at] repaired ${repaired.changed} row(s) in ${repaired.tableName}`);
    }
    console.log(`[db-repair-updated-at] repaired ${repairedRows} row(s) total`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[db-repair-updated-at] failed", error);
  process.exit(1);
});
