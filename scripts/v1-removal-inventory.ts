import prisma from '../src/config/db-config'
import { inventoryV1Removal } from '../src/services/migration/v1-removal-inventory-service'

try {
  console.log(JSON.stringify(await inventoryV1Removal(prisma), null, 2))
} finally {
  await prisma.$disconnect()
}
