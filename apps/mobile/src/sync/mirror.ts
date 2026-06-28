// MirrorTable describes what a local table looks like
export interface MirrorTable {
  name: string;
  columns: string[];
  primaryKey: string;
}

export class Mirror {
  private tables: Map<string, MirrorTable>;

  constructor(tables: MirrorTable[]) {
    this.tables = new Map(tables.map((t) => [t.name, t]));
  }

  /** Build the CREATE TABLE IF NOT EXISTS SQL for a mirror table */
  createTableSql(table: MirrorTable): string {
    const cols = table.columns.map((c) => {
      if (c === table.primaryKey) return `"${c}" text PRIMARY KEY`;
      return `"${c}" text`;
    });
    return `CREATE TABLE IF NOT EXISTS "${table.name}" (${cols.join(", ")});`;
  }

  /** UPSERT a row — INSERT OR REPLACE if primary key matches */
  upsertSql(
    table: string,
    row: Record<string, unknown>,
  ): { sql: string; params: unknown[] } {
    const t = this.tables.get(table);
    if (!t) throw new Error(`Unknown table: ${table}`);
    const cols = Object.keys(row);
    const placeholders = cols.map(() => "?");
    return {
      sql: `INSERT OR REPLACE INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders.join(", ")})`,
      params: cols.map((c) => row[c]),
    };
  }

  /** DELETE a row by primary key */
  deleteSql(
    table: string,
    id: string,
  ): { sql: string; params: string[] } {
    const t = this.tables.get(table);
    if (!t) throw new Error(`Unknown table: ${table}`);
    return {
      sql: `DELETE FROM "${table}" WHERE "${t.primaryKey}" = ?`,
      params: [id],
    };
  }

  /** SELECT * WHERE version > sinceVersion (delta pull) */
  selectSinceSql(
    table: string,
    sinceVersion: number,
  ): { sql: string; params: number[] } {
    return {
      sql: `SELECT * FROM "${table}" WHERE "version" > ?`,
      params: [sinceVersion],
    };
  }
}
