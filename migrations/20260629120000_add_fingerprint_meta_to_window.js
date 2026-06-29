/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // fp_locked: when true, the fingerprint is pinned and won't be auto-regenerated.
  const hasLocked = await knex.schema.hasColumn('window', 'fp_locked');
  if (!hasLocked) {
    await knex.schema.table('window', table => {
      table.boolean('fp_locked').notNullable().defaultTo(true);
    });
  }

  // Ensure the `fingerprint` column exists (full JSON payload). It is added by
  // 20240317074532_add_fingerprint_to_window.js, but guard here for safety.
  const hasFingerprint = await knex.schema.hasColumn('window', 'fingerprint');
  if (!hasFingerprint) {
    await knex.schema.table('window', table => {
      table.text('fingerprint').nullable();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasLocked = await knex.schema.hasColumn('window', 'fp_locked');
  if (hasLocked) {
    await knex.schema.table('window', table => {
      table.dropColumn('fp_locked');
    });
  }
};
