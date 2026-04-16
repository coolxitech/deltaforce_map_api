import 'dotenv/config';
import { getDatabaseConfig } from './database/database.config';
import { DatabaseService } from './database/database.service';
import { InstallResult, SchemaCheckResult } from './database/database.types';

async function main() {
  const config = getDatabaseConfig();
  const database = new DatabaseService();

  try {
    const result = await database.adapter.install();
    console.log(
      `Database initialized: ${config.driver}://${config.host}:${config.port}/${config.database}`,
    );
    printInstallResult(result);
  } finally {
    await database.onModuleDestroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function printInstallResult(result: InstallResult) {
  printCheck('Before install', result.before);

  if (result.actions.length > 0) {
    console.log('Actions:');
    for (const action of result.actions) {
      console.log(`  - ${action}`);
    }
  }

  printCheck('After install', result.after);

  if (!result.after.ok) {
    process.exitCode = 1;
  }
}

function printCheck(label: string, result: SchemaCheckResult) {
  console.log(`${label}: ${result.ok ? 'complete' : 'incomplete'}`);

  for (const issue of result.issues) {
    console.log(`  - ${issue}`);
  }
}
