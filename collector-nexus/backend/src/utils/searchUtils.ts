import { Model, Document, FilterQuery, QueryOptions } from 'mongoose';
import { escapeRegExp } from 'lodash';
import { logger } from './logger';
import { ApiError } from '../middleware/errorHandler';

// Search operators
const SEARCH_OPERATORS = ['=', '!=', '>', '>=', '<', '<=', '~', '!~', 'in', 'nin', 'all', 'exists'] as const;
type SearchOperator = typeof SEARCH_OPERATORS[number];

// Search condition interface
interface SearchCondition {
  field: string;
  operator: SearchOperator;
  value: any;
  options?: string;
}

// Search query interface
interface SearchQuery {
  query?: string;
  filters?: string | Record<string, any>;
  fields?: string[];
  sort?: string | Record<string, 1 | -1>;
  page?: number;
  limit?: number;
  include?: string[];
  exclude?: string[];
  [key: string]: any;
}

// Search result interface
interface SearchResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Parse a search query string into a MongoDB query
 * Format: field:value,field:>value,field:<=value,field:~regex,field:!~regex
 */
const parseSearchQuery = (query: string): SearchCondition[] => {
  if (!query) return [];
  
  const conditions: SearchCondition[] = [];
  const parts = query.split(',').filter(Boolean);
  
  for (const part of parts) {
    // Match field, operator, and value
    const match = part.match(/^([a-zA-Z0-9_.]+)([:!<>~]=?|!?~|in\[|nin\[|all\[|exists\[)([^\]]*)\]?$/);
    
    if (!match) continue;
    
    const [, field, op, value] = match;
    let operator: SearchOperator = '=';
    let val: any = value;
    
    // Parse operator and value
    switch (op) {
      case '!=':
        operator = '!=';
        break;
      case '>':
        operator = '>';
        break;
      case '>=':
        operator = '>=';
        break;
      case '<':
        operator = '<';
        break;
      case '<=':
        operator = '<=';
        break;
      case '~':
        operator = '~';
        val = new RegExp(escapeRegExp(val), 'i');
        break;
      case '!~':
        operator = '!~';
        val = new RegExp(escapeRegExp(val), 'i');
        break;
      case 'in[':
        operator = 'in';
        val = val.split('|').map((v: string) => v.trim()).filter(Boolean);
        break;
      case 'nin[':
        operator = 'nin';
        val = val.split('|').map((v: string) => v.trim()).filter(Boolean);
        break;
      case 'all[':
        operator = 'all';
        val = val.split('|').map((v: string) => v.trim()).filter(Boolean);
        break;
      case 'exists[':
        operator = 'exists';
        val = val.toLowerCase() === 'true';
        break;
      default:
        operator = '=';
    }
    
    // Try to parse value as number or boolean
    if (operator === '=' || operator === '!=') {
      if (!isNaN(Number(val))) {
        val = Number(val);
      } else if (val.toLowerCase() === 'true') {
        val = true;
      } else if (val.toLowerCase() === 'false') {
        val = false;
      } else if (val === 'null') {
        val = null;
      } else if (val === 'undefined') {
        val = undefined;
      }
    }
    
    conditions.push({
      field,
      operator,
      value: val,
    });
  }
  
  return conditions;
};

/**
 * Convert search conditions to a MongoDB query
 */
const buildMongoQuery = (conditions: SearchCondition[]): FilterQuery<any> => {
  const query: FilterQuery<any> = {};
  
  for (const condition of conditions) {
    const { field, operator, value } = condition;
    
    switch (operator) {
      case '=':
        query[field] = value;
        break;
      case '!=':
        query[field] = { $ne: value };
        break;
      case '>':
        query[field] = { $gt: value };
        break;
      case '>=':
        query[field] = { $gte: value };
        break;
      case '<':
        query[field] = { $lt: value };
        break;
      case '<=':
        query[field] = { $lte: value };
        break;
      case '~':
        query[field] = { $regex: value };
        break;
      case '!~':
        query[field] = { $not: { $regex: value } };
        break;
      case 'in':
        query[field] = { $in: value };
        break;
      case 'nin':
        query[field] = { $nin: value };
        break;
      case 'all':
        query[field] = { $all: value };
        break;
      case 'exists':
        query[field] = { $exists: value };
        break;
    }
  }
  
  return query;
};

/**
 * Parse sort string into a MongoDB sort object
 * Format: field:asc,field:desc
 */
const parseSortString = (sortString: string): Record<string, 1 | -1> => {
  const sort: Record<string, 1 | -1> = {};
  
  if (!sortString) {
    return sort;
  }
  
  const parts = sortString.split(',').filter(Boolean);
  
  for (const part of parts) {
    const [field, order] = part.split(':');
    if (field) {
      sort[field] = order?.toLowerCase() === 'desc' ? -1 : 1;
    }
  }
  
  return sort;
};

/**
 * Search documents in a MongoDB collection
 */
const searchDocuments = async <T extends Document>(
  model: Model<T>,
  searchQuery: SearchQuery = {}
): Promise<SearchResult<T>> => {
  const {
    query,
    filters,
    fields,
    sort,
    page = 1,
    limit = 10,
    include,
    exclude,
    ...rest
  } = searchQuery;
  
  try {
    // Build the base query
    const mongoQuery: FilterQuery<T> = {};
    
    // Add text search if query is provided
    if (query) {
      mongoQuery.$text = { $search: query };
    }
    
    // Add filters
    if (filters) {
      const filterQuery = typeof filters === 'string' 
        ? buildMongoQuery(parseSearchQuery(filters))
        : filters;
      
      Object.assign(mongoQuery, filterQuery);
    }
    
    // Add additional query parameters
    Object.assign(mongoQuery, rest);
    
    // Build the query options
    const options: QueryOptions = {};
    
    // Set fields to include/exclude
    if (fields && fields.length > 0) {
      options.projection = fields.reduce((acc, field) => ({
        ...acc,
        [field]: 1,
      }), {});
    }
    
    // Set sort
    if (sort) {
      options.sort = typeof sort === 'string' ? parseSortString(sort) : sort;
    }
    
    // Set pagination
    const skip = (page - 1) * limit;
    
    // Execute count and find queries in parallel
    const [total, data] = await Promise.all([
      model.countDocuments(mongoQuery),
      model
        .find(mongoQuery, null, options)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    
    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;
    
    return {
      data: data as T[],
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    };
  } catch (error) {
    logger.error('Error searching documents:', error);
    throw new ApiError(500, 'Error performing search');
  }
};

/**
 * Build a text search query for MongoDB
 */
const buildTextSearchQuery = (
  searchText: string,
  fields: string[],
  options: {
    caseSensitive?: boolean;
    diacriticSensitive?: boolean;
    language?: string;
    fuzzy?: boolean;
  } = {}
) => {
  const {
    caseSensitive = false,
    diacriticSensitive = false,
    language = 'english',
    fuzzy = false,
  } = options;
  
  const searchConditions = [];
  
  // Split search text into words
  const words = searchText.split(/\s+/).filter(Boolean);
  
  for (const field of fields) {
    const fieldConditions = [];
    
    for (const word of words) {
      const regexOptions = [];
      
      if (!caseSensitive) regexOptions.push('i');
      if (!diacriticSensitive) regexOptions.push('m');
      
      const regex = new RegExp(
        fuzzy ? `\\b${escapeRegExp(word)}\\w*` : escapeRegExp(word),
        regexOptions.join('')
      );
      
      fieldConditions.push({ [field]: { $regex: regex } });
    }
    
    if (fieldConditions.length > 0) {
      searchConditions.push({ $and: fieldConditions });
    }
  }
  
  return searchConditions.length > 0 ? { $or: searchConditions } : {};
};

/**
 * Build an aggregation pipeline for faceted search
 */
const buildFacetPipeline = (
  searchQuery: any,
  facets: Array<{
    field: string;
    name: string;
    type?: 'terms' | 'range' | 'date';
    ranges?: Array<{ from?: any; to?: any; label: string }>;
    size?: number;
    sort?: Record<string, 1 | -1>;
  }>,
  options: {
    page?: number;
    limit?: number;
    sort?: Record<string, 1 | -1>;
  } = {}
) => {
  const pipeline: any[] = [];
  
  // Match stage
  if (Object.keys(searchQuery).length > 0) {
    pipeline.push({ $match: searchQuery });
  }
  
  // Facet stage
  const facetStage: any = {};
  
  for (const facet of facets) {
    const { field, name, type = 'terms', ranges, size = 10, sort: facetSort } = facet;
    
    if (type === 'range' && ranges) {
      facetStage[name] = [
        {
          $bucket: {
            groupBy: `$${field}`,
            boundaries: ranges.map((r, i) => i < ranges.length - 1 ? ranges[i].from : ranges[i].to),
            default: 'other',
            output: {
              count: { $sum: 1 },
              // Include additional aggregations here if needed
            },
          },
        },
        {
          $project: {
            _id: 0,
            range: {
              $let: {
                vars: {
                  index: { $indexOfArray: [ranges.map(r => r.label), `$_id`] },
                },
                in: {
                  from: { $arrayElemAt: [ranges.map(r => r.from), '$$index'] },
                  to: { $arrayElemAt: [ranges.map(r => r.to), '$$index'] },
                  label: { $arrayElemAt: [ranges.map(r => r.label), '$$index'] },
                },
              },
            },
            count: 1,
          },
        },
      ];
    } else {
      // Terms facet
      const termsPipeline: any[] = [
        { $match: { [field]: { $exists: true, $ne: null } } },
        { $group: { _id: `$${field}`, count: { $sum: 1 } } },
        { $sort: facetSort || { count: -1, _id: 1 } },
      ];
      
      if (size) {
        termsPipeline.push({ $limit: size });
      }
      
      facetStage[name] = termsPipeline;
    }
  }
  
  // Add facet stage to pipeline
  if (Object.keys(facetStage).length > 0) {
    pipeline.push({ $facet: facetStage });
  }
  
  // Add pagination and sorting if needed
  if (options.page && options.limit) {
    const skip = (options.page - 1) * options.limit;
    pipeline.push(
      { $skip: skip },
      { $limit: options.limit }
    );
  }
  
  if (options.sort) {
    pipeline.push({ $sort: options.sort });
  }
  
  return pipeline;
};

export {
  searchDocuments,
  parseSearchQuery,
  buildMongoQuery,
  parseSortString,
  buildTextSearchQuery,
  buildFacetPipeline,
  SearchQuery,
  SearchResult,
  SearchCondition,
  SearchOperator,
  SEARCH_OPERATORS,
};
