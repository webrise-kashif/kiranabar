import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CartModule } from "./cart/cart.module";
import { CategoriesModule } from "./categories/categories.module";
import { AppConfigModule } from "./config/app-config.module";
import { HealthModule } from "./health/health.module";
import { InventoryModule } from "./inventory/inventory.module";
import { OrdersModule } from "./orders/orders.module";
import { PaymentsModule } from "./payments/payments.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProductsModule } from "./products/products.module";
import { ShippingModule } from "./shipping/shipping.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    HealthModule,
    // Domain foundations -- module boundaries only, no business logic yet.
    // See docs/requirements.md for scope and CLAUDE.md for the rules on
    // what "foundation only" means for each of these.
    AuthModule,
    UsersModule,
    ProductsModule,
    CategoriesModule,
    InventoryModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
  ],
})
export class AppModule {}
