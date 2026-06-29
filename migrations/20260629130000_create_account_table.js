/**
 * Phase 3.2 — account table for per-profile credential storage.
 * Credentials (password/secret) are stored encrypted (AES-256-GCM) by the
 * application layer; this table only holds the ciphertext.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('account');
  if (exists) {
    return;
  }
  return knex.schema.createTable('account', table => {
    table.increments('id').primary().unique();
    table
      .integer('window_id')
      .nullable()
      .references('id')
      .inTable('window')
      .onDelete('CASCADE');
    table.string('platform').nullable();
    table.string('username').nullable();
    table.text('password_enc').nullable();
    table.text('secret_enc').nullable();
    table.text('notes').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(null).nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const exists = await knex.schema.hasTable('account');
  if (!exists) {
    return;
  }
  return knex.schema.dropTable('account');
};
