/**
 * Add error artifact paths to RPA task logs.
 *
 * When a node fails, the engine stores screenshot/HTML/current URL so users can
 * debug why a workflow failed without reproducing immediately.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasLog = await knex.schema.hasTable('rpa_task_log');
  if (!hasLog) return;

  await knex.schema.alterTable('rpa_task_log', async table => {
    if (!(await knex.schema.hasColumn('rpa_task_log', 'artifact_dir'))) {
      table.text('artifact_dir').nullable();
    }
    if (!(await knex.schema.hasColumn('rpa_task_log', 'screenshot_path'))) {
      table.text('screenshot_path').nullable();
    }
    if (!(await knex.schema.hasColumn('rpa_task_log', 'html_path'))) {
      table.text('html_path').nullable();
    }
    if (!(await knex.schema.hasColumn('rpa_task_log', 'current_url'))) {
      table.text('current_url').nullable();
    }
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasLog = await knex.schema.hasTable('rpa_task_log');
  if (!hasLog) return;

  await knex.schema.alterTable('rpa_task_log', table => {
    table.dropColumn('artifact_dir');
    table.dropColumn('screenshot_path');
    table.dropColumn('html_path');
    table.dropColumn('current_url');
  });
};
