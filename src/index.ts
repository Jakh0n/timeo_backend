import "dotenv/config";
import { app } from "./app.ts";
import { loadHighs } from "./scheduler/highs.ts";

const port = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  await loadHighs();

  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
