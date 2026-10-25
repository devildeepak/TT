// Sign the remote field-mapping file so the extension only accepts mappings you published.
//   node scripts/sign-config.mjs keygen            -> prints a new key pair (keep the private key secret!)
//   PRIVATE_KEY=<base64 pkcs8> node scripts/sign-config.mjs sign path/selectors.json
// Writes selectors.json.sig next to the file. Paste the PUBLIC key into Settings → Field mappings.
import { generateKeyPairSync, createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const [cmd, file] = process.argv.slice(2);
if (cmd === "keygen") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  console.log("PUBLIC (paste in extension settings):", publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64"));
  console.log("PRIVATE (store as a secret):         ", privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"));
} else if (cmd === "sign" && file) {
  const key = createPrivateKey({ key: Buffer.from(process.env.PRIVATE_KEY, "base64"), format: "der", type: "pkcs8" });
  const json = JSON.parse(readFileSync(file, "utf8"));
  if (!json.version || !json.flows) throw new Error("Not a selectors file");
  writeFileSync(file + ".sig", sign(null, readFileSync(file), key).toString("base64"));
  console.log("signed", file, "version", json.version);
} else console.log("usage: keygen | sign <file>");
