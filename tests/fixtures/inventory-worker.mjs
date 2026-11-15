import { openStorage } from "../../src/server/sqlite.mjs";
import { createService } from "../../src/server/service/http.mjs";
const storage = openStorage(process.argv[2]),
  owner = { id: process.argv[3], role: "owner", active: true };
const { inventory } = createService({
  storage,
  currentUser: () => owner,
  people: () => [{ id: owner.id, name: "Fixture owner" }],
});
process.stdout.write("READY\n");
process.stdin.once("data", () => {
  try {
    const result = inventory.post(
      owner,
      "transfer",
      JSON.parse(process.argv[4]),
    );
    process.stdout.write(JSON.stringify({ ok: true, result }) + "\n");
  } catch (e) {
    process.stdout.write(
      JSON.stringify({ ok: false, status: e.status || 500, error: e.message }) +
        "\n",
    );
  } finally {
    storage.close();
    process.stdin.destroy();
  }
});
