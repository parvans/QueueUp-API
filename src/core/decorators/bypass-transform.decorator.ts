import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const BYPASS_TRANSFORM_KEY = 'bypassTransform';

/**
 * Decorator to bypass the standardized JSON response transformation for a specific route handler or controller.
 * Useful for file downloads, health checks with custom formats, or raw responses.
 */
export const BypassTransform = (): CustomDecorator<string> =>
  SetMetadata(BYPASS_TRANSFORM_KEY, true);

