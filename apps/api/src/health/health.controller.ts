import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";

interface HealthStatus {
  status: "ok";
  timestamp: string;
}

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  check(): HealthStatus {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
