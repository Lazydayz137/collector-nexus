import { Request } from 'express';
import { ApiError } from '../middleware/errorHandler';

// Default pagination values
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * Pagination options interface
 */
interface PaginationOptions {
  page: number;
  limit: number;
  skip: number;
  sort: Record<string, 1 | -1>;
}

/**
 * Parse pagination parameters from request query
 */
const getPaginationParams = (req: Request): { page: number; limit: number } => {
  const page = Math.abs(parseInt(req.query.page as string, 10)) || DEFAULT_PAGE;
  let limit = Math.abs(parseInt(req.query.limit as string, 10)) || DEFAULT_LIMIT;
  
  // Enforce maximum limit
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }
  
  return { page, limit };
};

/**
 * Parse sort parameter from request query
 * Format: field1:asc,field2:desc
 */
const getSortParams = (req: Request, defaultSort: Record<string, 1 | -1> = { createdAt: -1 }): Record<string, 1 | -1> => {
  const sortQuery = req.query.sort as string;
  
  if (!sortQuery) {
    return defaultSort;
  }
  
  const sort: Record<string, 1 | -1> = {};
  const sortFields = sortQuery.split(',');
  
  for (const field of sortFields) {
    const [key, order] = field.split(':');
    if (key) {
      sort[key] = order?.toLowerCase() === 'desc' ? -1 : 1;
    }
  }
  
  return Object.keys(sort).length > 0 ? sort : defaultSort;
};

/**
 * Get pagination options from request
 */
const getPaginationOptions = (
  req: Request,
  defaultSort: Record<string, 1 | -1> = { createdAt: -1 }
): PaginationOptions => {
  const { page, limit } = getPaginationParams(req);
  const sort = getSortParams(req, defaultSort);
  
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    sort,
  };
};

/**
 * Format paginated response
 */
const formatPaginationResponse = <T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
  additionalData: Record<string, any> = {}
) => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;
  
  return {
    data: items,
    pagination: {
      totalItems: total,
      totalPages,
      currentPage: page,
      itemsPerPage: limit,
      hasNextPage,
      hasPreviousPage,
      nextPage: hasNextPage ? page + 1 : null,
      previousPage: hasPreviousPage ? page - 1 : null,
    },
    ...additionalData,
  };
};

/**
 * Validate page and limit parameters
 */
const validatePaginationParams = (page: number, limit: number): void => {
  if (isNaN(page) || page < 1) {
    throw new ApiError(400, 'Page must be a positive integer');
  }
  
  if (isNaN(limit) || limit < 1) {
    throw new ApiError(400, 'Limit must be a positive integer');
  }
  
  if (limit > MAX_LIMIT) {
    throw new ApiError(400, `Limit cannot exceed ${MAX_LIMIT}`);
  }
};

/**
 * Generate pagination links for HATEOAS
 */
const generatePaginationLinks = (
  req: Request,
  page: number,
  totalPages: number,
  additionalParams: Record<string, string> = {}
) => {
  const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
  const queryParams = new URLSearchParams({
    ...req.query as Record<string, string>,
    ...additionalParams,
  });
  
  const links: { rel: string; href: string; method: string }[] = [];
  
  // Self link
  queryParams.set('page', page.toString());
  links.push({
    rel: 'self',
    href: `${baseUrl}?${queryParams.toString()}`,
    method: 'GET',
  });
  
  // First page link
  if (page > 1) {
    queryParams.set('page', '1');
    links.push({
      rel: 'first',
      href: `${baseUrl}?${queryParams.toString()}`,
      method: 'GET',
    });
  }
  
  // Previous page link
  if (page > 1) {
    queryParams.set('page', (page - 1).toString());
    links.push({
      rel: 'prev',
      href: `${baseUrl}?${queryParams.toString()}`,
      method: 'GET',
    });
  }
  
  // Next page link
  if (page < totalPages) {
    queryParams.set('page', (page + 1).toString());
    links.push({
      rel: 'next',
      href: `${baseUrl}?${queryParams.toString()}`,
      method: 'GET',
    });
  }
  
  // Last page link
  if (page < totalPages) {
    queryParams.set('page', totalPages.toString());
    links.push({
      rel: 'last',
      href: `${baseUrl}?${queryParams.toString()}`,
      method: 'GET',
    });
  }
  
  return links;
};

export {
  getPaginationParams,
  getSortParams,
  getPaginationOptions,
  formatPaginationResponse,
  validatePaginationParams,
  generatePaginationLinks,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
