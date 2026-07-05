import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse();
    this.metricsService.incrementTotal();
    return next.handle().pipe(
      tap({
        next: () => {
          const code = res.statusCode as number;
          if (code >= 500) this.metricsService.increment5xx();
          else if (code >= 400) this.metricsService.increment4xx();
        },
        error: () => {
          const code = res.statusCode as number;
          if (code >= 500) this.metricsService.increment5xx();
          else if (code >= 400) this.metricsService.increment4xx();
        },
      }),
    );
  }
}
