#!/usr/bin/env tsx

/**
 * Test script to demonstrate locator group JSON file functionality
 * Run with: npm run regenerate-features
 */

import { promises as fs } from "fs";
import path from "path";

async function testLocatorGroupFiles() {
  console.log("🧪 Testing Locator Group JSON File System...\n");

  const locatorsDir = path.join(process.cwd(), "tests", "locators");

  try {
    // Check if the directory exists
    await fs.access(locatorsDir);
    console.log("✅ tests/locators directory exists");

    // List all files in the directory
    const files = await fs.readdir(locatorsDir, { recursive: true });

    if (files.length === 0) {
      console.log("📁 Directory is empty - no locator group files created yet");
      console.log(
        "💡 Create a locator group in the application to generate JSON files"
      );
    } else {
      console.log("📁 Found the following locator group files:");

      for (const file of files) {
        if (typeof file === "string" && file.endsWith(".json")) {
          const filePath = path.join(locatorsDir, file);
          try {
            const content = await fs.readFile(filePath, "utf-8");
            const jsonContent = JSON.parse(content);
            const locatorCount = Object.keys(jsonContent).length;

            console.log(`  📄 ${file} (${locatorCount} locators)`);

            // Show first few locators as example
            const locatorNames = Object.keys(jsonContent).slice(0, 3);
            if (locatorNames.length > 0) {
              console.log(
                `     Locators: ${locatorNames.join(", ")}${Object.keys(jsonContent).length > 3 ? "..." : ""}`
              );
            }
          } catch (error) {
            console.log(`  ❌ ${file} - Error reading file`);
          }
        }
      }
    }

    console.log("\n🎯 How it works:");
    console.log(
      "1. Create a locator group → JSON file created with empty object {}"
    );
    console.log(
      "2. Add locators to the group → JSON file updated with locator name-value pairs"
    );
    console.log("3. Rename the group → JSON file renamed");
    console.log("4. Change module → JSON file moved to new module path");
    console.log(
      "5. Delete the group → JSON file deleted, empty directories cleaned up"
    );

    console.log("\n📚 File structure follows module hierarchy:");
    console.log("   tests/locators/{module_path}/{locator_group_name}.json");
  } catch (error) {
    console.log("❌ tests/locators directory not found");
    console.log(
      "💡 The directory will be created automatically when you create your first locator group"
    );
  }
}

// Run the test
testLocatorGroupFiles().catch(console.error);
