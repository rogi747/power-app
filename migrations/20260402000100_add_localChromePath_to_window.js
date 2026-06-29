/**
 * Add missing fields to window table
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('window', table => {
    table.string('localChromePath').nullable();
    table.boolean('useLocalChrome').defaultTo(false);
    table.string('chromiumBinPath').nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('window', table => {
    table.dropColumn('localChromePath');
    table.dropColumn('useLocalChrome');
    table.dropColumn('chromiumBinPath');
  });
};
