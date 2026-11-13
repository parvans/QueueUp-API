import { Module } from '@nestjs/common';
import { TransformInterceptor } from './interceptors/transform.interceptor';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

@Module({
  providers: [TransformInterceptor, LoggingInterceptor, AllExceptionsFilter],
  exports: [TransformInterceptor, LoggingInterceptor, AllExceptionsFilter],
})
export class CoreModule {}
