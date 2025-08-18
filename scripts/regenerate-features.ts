#!/usr/bin/env tsx

/**
 * Script to regenerate all feature files from the current database state
 * Run this after merging changes or database migrations to ensure sync
 *
 * Usage: npx tsx scripts/regenerate-features.ts
 */

import { regenerateAllFeatureFiles } from "../src/lib/feature-file-generator";

async function main() {
  try {
    console.log("🔄 Regenerating all feature files from database...");
    console.log(
      "⚠️  This will delete all existing feature files and recreate them from the database."
    );

    const generatedFiles = await regenerateAllFeatureFiles();

    console.log("\n✅ Regeneration completed successfully!");
    console.log(`📁 Generated ${generatedFiles.length} feature files:`);

    generatedFiles.forEach((filePath, index) => {
      const relativePath = filePath.replace(process.cwd(), ".");
      console.log(`   ${index + 1}. ${relativePath}`);
    });

    if (generatedFiles.length === 0) {
      console.log(
        "   No test suites found in database - no feature files generated."
      );
    }

    console.log("\n💡 Tip: Run this script after:");
    console.log("   - Merging changes from other developers");
    console.log("   - Database migrations or resets");
    console.log("   - Suspecting feature files are out of sync");
  } catch (error) {
    console.error("\n❌ Error during regeneration:", error);
    process.exit(1);
  }
}

main();

