import { orderQuerySchema } from "@kiranabar/validation";
import { createZodDto } from "nestjs-zod";

export class OrderQueryDto extends createZodDto(orderQuerySchema) {}
