import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const projectId = "wmgj-master-data-demo";
let environment: RulesTestEnvironment;

async function seed(): Promise<void> {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    const future = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
    await setDoc(doc(firestore, "tenants/tenant-a"), {
      status: "ACTIVE",
    });
    await setDoc(doc(firestore, "tenants/tenant-a/members/user-a"), {
      status: "ACTIVE",
      permissions: [
        "dashboard.read",
        "validation.read",
        "audit.read",
      ],
      allSites: true,
      siteIds: [],
      expiresAt: future,
    });
    await setDoc(
      doc(firestore, "tenants/tenant-a/dashboard_snapshots/current"),
      { siteId: null, status: "OK" },
    );
    await setDoc(
      doc(firestore, "tenants/tenant-a/validation_tasks/task-1"),
      { siteId: null, status: "OPEN" },
    );
    await setDoc(
      doc(firestore, "tenants/tenant-a/audit_events/event-1"),
      { siteId: null, action: "SYNTHETIC" },
    );
    await setDoc(doc(firestore, "tenants/tenant-b"), {
      status: "ACTIVE",
    });
    await setDoc(
      doc(firestore, "tenants/tenant-b/dashboard_snapshots/current"),
      { siteId: null, status: "OK" },
    );
  });
}

beforeAll(async () => {
  const rulesPath = fileURLToPath(new URL("../firestore.rules", import.meta.url));
  const rules = await readFile(rulesPath, "utf8");
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 8080, rules },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seed();
});

afterAll(async () => {
  await environment.cleanup();
});

describe("firestore.rules", () => {
  it("nega dashboard sem autenticação", async () => {
    const firestore = environment.unauthenticatedContext().firestore();
    await assertFails(
      getDoc(doc(firestore, "tenants/tenant-a/dashboard_snapshots/current")),
    );
  });

  it("permite leitura autorizada e limitada do dashboard", async () => {
    const firestore = environment
      .authenticatedContext("user-a")
      .firestore();
    await assertSucceeds(
      getDocs(
        query(
          collection(firestore, "tenants/tenant-a/dashboard_snapshots"),
          limit(50),
        ),
      ),
    );
  });

  it("nega escrita direta mesmo para membro ativo", async () => {
    const firestore = environment
      .authenticatedContext("user-a")
      .firestore();
    await assertFails(
      setDoc(
        doc(firestore, "tenants/tenant-a/validation_tasks/task-2"),
        { siteId: null, status: "OPEN" },
      ),
    );
  });

  it("nega leitura cruzada entre tenants", async () => {
    const firestore = environment
      .authenticatedContext("user-a")
      .firestore();
    await assertFails(
      getDoc(doc(firestore, "tenants/tenant-b/dashboard_snapshots/current")),
    );
  });

  it("nega alteração ou exclusão lógica de evento de auditoria", async () => {
    const firestore = environment
      .authenticatedContext("user-a")
      .firestore();
    await assertFails(
      setDoc(
        doc(firestore, "tenants/tenant-a/audit_events/event-1"),
        { siteId: null, action: "ALTERED" },
      ),
    );
  });

  it("nega coleções privadas por padrão", async () => {
    const firestore = environment
      .authenticatedContext("user-a")
      .firestore();
    await assertFails(
      getDoc(doc(firestore, "tenants/tenant-a/private_data/secret-1")),
    );
  });
});
