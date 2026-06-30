/**
 * Persisted RPA scheduler table.
 *
 * Stores cron schedules so scheduled workflow runs survive app restart. Runtime
 * state such as `last_run` is updated whenever a schedule fires.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasSchedule = await knex.schema.hasTable('rpa_schedule');
  if (!hasSchedule) {
    await knex.schema.createTable('rpa_schedule', table => {
      table.string('id').primary().unique();
      table.string('name').notNullable();
      table.string('cron').notNullable();
      table
        .integer('workflow_id')
        .notNullable()
        .references('id')
        .inTable('rpa_workflow')
        .onDelete('CASCADE');
      // JSON encoded number[].
      table.text('window_ids').notNullable();
      // JSON encoded variable overrides.
      table.text('variables').nullable();
      table.boolean('enabled').defaultTo(true);
      table.boolean('valid').defaultTo(true);
      table.timestamp('last_run').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(null).nullable();
      table.index(['workflow_id']);
      table.index(['enabled']);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasSchedule = await knex.schema.hasTable('rpa_schedule');
  if (hasSchedule) {
    await knex.schema.dropTable('rpa_schedule');
  }
};
