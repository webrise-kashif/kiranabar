import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { Order, PaginatedResult, PublicUser } from "@kiranabar/types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { isStaff } from "../auth/is-staff.util";
import { CheckoutDto } from "./dto/checkout.dto";
import { OrderQueryDto } from "./dto/order-query.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { OrdersService } from "./orders.service";

/**
 * Checkout and cancellation are customer-only, scoped to the caller via
 * @CurrentUser() -- checkout requires an account (per
 * docs/requirements.md), so neither is @Public(); the default global
 * JwtAuthGuard applies unmodified. Listing/reading a single order is
 * role-aware (an ADMIN/SUPER_ADMIN caller sees every order, a CUSTOMER
 * only their own), the same pattern ProductsController uses for catalog
 * visibility. Updating status is admin-only via @Roles(...).
 */
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post("checkout")
  checkout(@CurrentUser() user: PublicUser, @Body() dto: CheckoutDto): Promise<Order> {
    return this.ordersService.checkout(user.id, dto);
  }

  @Get()
  findOrders(
    @CurrentUser() user: PublicUser,
    @Query() query: OrderQueryDto,
  ): Promise<PaginatedResult<Order>> {
    return this.ordersService.findOrders(user.id, isStaff(user), query, query.userId);
  }

  @Get(":id")
  findOrder(@CurrentUser() user: PublicUser, @Param("id") id: string): Promise<Order> {
    return this.ordersService.findOrder(user.id, isStaff(user), id);
  }

  @Patch(":id/cancel")
  cancelMyOrder(@CurrentUser() user: PublicUser, @Param("id") id: string): Promise<Order> {
    return this.ordersService.cancelMyOrder(user.id, id);
  }

  /** Forward-only, one stage at a time -- PLACED -> PAID -> SHIPPED -> DELIVERED. */
  @Roles("ADMIN", "SUPER_ADMIN")
  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateOrderStatusDto): Promise<Order> {
    return this.ordersService.updateStatus(id, dto.status);
  }
}
