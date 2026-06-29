/**
 * Browser RPA system tables.
 *
 *  - `rpa_workflow`  stores the visual workflow definition (nodes/edges/etc.)
 *                    serialised as JSON in the `definition` column.
 *  - `rpa_task_log`  stores per-node and per-run execution logs.
 *
 * Follows the same conventions as the existing tables: integer PK, knex.fn.now()
 * timestamps, and idempotent up/down guarded by hasTable.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasWorkflow = await knex.schema.hasTable('rpa_workflow');
  if (!hasWorkflow) {
    await knex.schema.createTable('rpa_workflow', table => {
      table.increments('id').primary().unique();
      table.string('name').notNullable();
      table.text('description').nullable();
      // Serialised RPA.Workflow JSON.
      table.text('definition').notNullable();
      table.string('folder').nullable();
      // Comma/JSON encoded tag list, mirroring how the window table stores tags.
      table.text('tags').nullable();
      table.boolean('pinned').defaultTo(false);
      table.boolean('favorite').defaultTo(false);
      // 1: active, 0: soft-deleted (recoverable).
      table.integer('status').defaultTo(1);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(null).nullable();
    });
  }

  const hasLog = await knex.schema.hasTable('rpa_task_log');
  if (!hasLog) {
    await knex.schema.createTable('rpa_task_log', table => {
      table.increments('id').primary().unique();
      table.string('run_id').notNullable();
      table
        .integer('workflow_id')
        .nullable()
        .references('id')
        .inTable('rpa_workflow')
        .onDelete('SET NULL');
      table.string('workflow_name').nullable();
      table.string('node_id').nullable();
      table.string('node_type').nullable();
      table
        .integer('window_id')
        .nullable()
        .references('id')
        .inTable('window')
        .onDelete('SET NULL');
      table.string('profile_id').nullable();
      table.string('thread_id').nullable();
      table.string('status').nullable();
      table.text('message').nullable();
      table.text('stack').nullable();
      table.integer('retry_count').defaultTo(0);
      table.timestamp('started_at').nullable();
      table.timestamp('finished_at').nullable();
      table.integer('duration').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['run_id']);
      table.index(['workflow_id']);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasLog = await knex.schema.hasTable('rpa_task_log');
  if (hasLog) {
    await knex.schema.dropTable('rpa_task_log');
  }
  const hasWorkflow = await knex.schema.hasTable('rpa_workflow');
  if (hasWorkflow) {
    await knex.schema.dropTable('rpa_workflow');
  }
};
