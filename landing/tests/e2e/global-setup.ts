import { startServer } from './server';

export default async function globalSetup(): Promise<void> {
  // Workers inherit the environment, so the config reads this as baseURL.
  process.env.E2E_BASE_URL = await startServer();
}
