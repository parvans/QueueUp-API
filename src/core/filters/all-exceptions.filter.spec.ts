import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ArgumentsHost,
} from '@nestjs/common';
import {
  AllExceptionsFilter,
  StandardApiErrorResponse,
} from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
    headersSent: boolean;
  };
  let mockRequest: {
    url: string;
    method: string;
  };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      headersSent: false,
    };
    mockRequest = {
      url: '/api/v1/test',
      method: 'GET',
    };
    mockHost = {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should transform standard HttpException into StandardApiErrorResponse', () => {
    const exception = new NotFoundException('Queue not found');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: 'Queue not found',
        path: '/api/v1/test',
      }),
    );
  });

  it('should handle validation BadRequestException with array of messages', () => {
    const validationErrors = [
      'phone must be a valid phone number',
      'name should not be empty',
    ];
    const exception = new BadRequestException({
      statusCode: 400,
      message: validationErrors,
      error: 'Bad Request',
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const firstCall = (mockResponse.json.mock.calls as unknown[][])[0];
    const sentData = firstCall[0] as StandardApiErrorResponse;
    expect(sentData.success).toBe(false);
    expect(sentData.statusCode).toBe(400);
    expect(sentData.message).toEqual(validationErrors);
    expect(sentData.error).toBe('Bad Request');
  });

  it('should transform Prisma P2002 unique constraint error into 409 Conflict', () => {
    const prismaError = new Error(
      'Unique constraint failed on the fields: (`phone`)',
    );
    Object.defineProperty(prismaError, 'constructor', {
      value: { name: 'PrismaClientKnownRequestError' },
    });
    (prismaError as unknown as { code: string }).code = 'P2002';

    filter.catch(prismaError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'A record with this unique identifier already exists.',
      }),
    );
  });

  it('should transform Prisma P2025 not found error into 404 NotFound', () => {
    const prismaError = new Error('Record to update not found.');
    Object.defineProperty(prismaError, 'constructor', {
      value: { name: 'PrismaClientKnownRequestError' },
    });
    (prismaError as unknown as { code: string }).code = 'P2025';

    filter.catch(prismaError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: 'The requested record was not found.',
      }),
    );
  });

  it('should transform unknown Error into 500 InternalServerError', () => {
    const genericError = new Error('Unexpected database connection timeout');

    filter.catch(genericError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'InternalServerError',
      }),
    );
  });

  it('should safely do nothing when headersSent is true', () => {
    mockResponse.headersSent = true;
    const exception = new HttpException('Error', 500);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).not.toHaveBeenCalled();
    expect(mockResponse.json).not.toHaveBeenCalled();
  });

  it('should bypass non-HTTP hosts (e.g. WebSockets)', () => {
    const wsHost = {
      getType: () => 'ws',
    } as unknown as ArgumentsHost;

    filter.catch(new Error('WS error'), wsHost);

    expect(mockResponse.status).not.toHaveBeenCalled();
  });
});
