import type { BigIntStats, Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { sameFileIdentity, type FileIdentityStat } from "@openclaw/fs-safe/advanced";
import { loadSqliteVecExtension } from "../infra/database-engine/sqlite-vec.js";
import type { DirectoryReceipt, ExactDirectoryReceipt } from "../infra/directory-durability.js";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import { SQLITE_SIDECAR_SUFFIXES } from "../infra/sqlite-files.js";
import { assertSqliteIntegrity } from "../infra/sqlite-integrity.js";
import { readSqliteUserVersion } from "../infra/sqlite-user-version.js";
import { assertDirectory } from "./local-repository-directory-policy.js";
import { copySnapshotArtifact, hashSnapshotArtifact, type SnapshotArtifactDigest } from "./manifest.js";
import { buildSnapshotValidator } from "./openclaw-snapshot-copy.js";
import { SNAPSHOT_SQLITE_FILENAME, type SnapshotDatabaseIdentity, type SnapshotManifest } from "./snapshot-provider.js";

const VALIDATION_STAGING_ENTRIES = new Set([
  SNAPSHOT_SQLITE_FILENAME,
  ...SQLITE_SIDECAR_SUFFIXES.map((suffix) => `${SNAPSHOT_SQLITE_FILENAME}${suffix}`),
]);
type StagingOperation = <T>(options: {
  rootReceipt: DirectoryReceipt<Stats | BigIntStats> & Pick<ExactDirectoryReceipt, "exactIdentity">;
  prefix: string;
  allowedEntries: ReadonlySet<string>;
  operation: (directoryPath: string, directoryIdentity: BigIntStats) => Promise<T>;
}) => Promise<T>;

export function assertArtifactMatchesManifest(
  artifactPath: string,
  artifact: SnapshotArtifactDigest,
  manifest: SnapshotManifest,
): void {
  if (artifact.sizeBytes !== manifest.artifact.sizeBytes) {
    throw new Error(
      `Snapshot artifact size mismatch for ${artifactPath}: expected ${manifest.artifact.sizeBytes}, got ${artifact.sizeBytes}`,
    );
  }
  if (artifact.sha256 !== manifest.artifact.sha256) {
    throw new Error(
      `Snapshot artifact hash mismatch for ${artifactPath}: expected ${manifest.artifact.sha256}, got ${artifact.sha256}`,
    );
  }
}

export function assertAllowedDatabaseRole(
  manifest: SnapshotManifest,
  allowedRoles: readonly SnapshotDatabaseIdentity["role"][] | undefined,
): void {
  if (!allowedRoles || allowedRoles.includes(manifest.database.role)) {
    return;
  }
  throw new Error(
    `SQLite snapshot database role ${manifest.database.role} is not allowed for this operation.`,
  );
}

export async function verifySnapshotDatabaseFile(
  artifactPath: string,
  expectedIdentity: FileIdentityStat,
  manifest: SnapshotManifest,
  validationRootPath: string,
  withPrivateSqliteStagingDirectory: StagingOperation,
): Promise<void> {
  const beforeOpen = await fs.lstat(artifactPath, { bigint: true });
  if (
    beforeOpen.isSymbolicLink() ||
    !beforeOpen.isFile() ||
    beforeOpen.nlink > 1n ||
    !sameFileIdentity(expectedIdentity, beforeOpen)
  ) {
    throw new Error(`Snapshot artifact changed before SQLite verification: ${artifactPath}`);
  }

  const validationRootIdentity = await fs.lstat(validationRootPath, { bigint: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!validationRootIdentity) {
    throw new Error(
      `SQLite validation root does not exist: ${validationRootPath}. Create a private directory there or pass an existing directory with \`--scratch\`.`,
    );
  }
  assertDirectory(validationRootIdentity, validationRootPath, "SQLite validation root");
  const canonicalValidationRootPath = await fs.realpath(validationRootPath);
  await withPrivateSqliteStagingDirectory({
    rootReceipt: {
      path: canonicalValidationRootPath,
      realPath: canonicalValidationRootPath,
      identity: validationRootIdentity,
      exactIdentity: validationRootIdentity,
    },
    prefix: ".tmp-verify-",
    allowedEntries: VALIDATION_STAGING_ENTRIES,
    operation: async (validationDir) => {
      const validationPath = path.join(validationDir, SNAPSHOT_SQLITE_FILENAME);
      const validationArtifact = await copySnapshotArtifact(
        path.dirname(artifactPath),
        validationPath,
      );
      assertArtifactMatchesManifest(validationPath, validationArtifact, manifest);
      const database = openNodeSqliteDatabase(validationPath, {
        allowExtension: true,
        readOnly: true,
      });
      try {
        database.exec("PRAGMA busy_timeout = 30000; PRAGMA trusted_schema = OFF;");
        await loadSqliteVecExtension({ db: database });
        assertSqliteIntegrity(database, artifactPath);
        buildSnapshotValidator(manifest.database)(database, artifactPath);
        const userVersion = readSqliteUserVersion(database);
        if (userVersion !== manifest.database.userVersion) {
          throw new Error(
            `Snapshot database user_version mismatch for ${artifactPath}: expected ${manifest.database.userVersion}, got ${userVersion}`,
          );
        }
      } finally {
        database.close();
      }
      const validatedArtifact = await hashSnapshotArtifact(validationDir);
      if (!sameFileIdentity(validationArtifact.identity, validatedArtifact.identity)) {
        throw new Error(`Snapshot validation copy changed: ${validationPath}`);
      }
      assertArtifactMatchesManifest(validationPath, validatedArtifact, manifest);
    },
  });
  const afterOpen = await fs.lstat(artifactPath, { bigint: true });
  if (
    afterOpen.isSymbolicLink() ||
    !afterOpen.isFile() ||
    afterOpen.nlink > 1n ||
    !sameFileIdentity(expectedIdentity, afterOpen)
  ) {
    throw new Error(`Snapshot artifact changed during SQLite verification: ${artifactPath}`);
  }
  const verifiedArtifact = await hashSnapshotArtifact(path.dirname(artifactPath));
  if (!sameFileIdentity(expectedIdentity, verifiedArtifact.identity)) {
    throw new Error(`Snapshot artifact changed after SQLite verification: ${artifactPath}`);
  }
  assertArtifactMatchesManifest(artifactPath, verifiedArtifact, manifest);
}

