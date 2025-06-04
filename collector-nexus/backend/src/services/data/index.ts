// Export all data services
export * from './acquisition.service';
export * from './processing.service';
export * from './storage.service';

// Import and re-export all data-related services
import { dataAcquisitionService } from './acquisition.service';
import { dataProcessingService } from './processing.service';
import { dataStorageService } from './storage.service';
import dataSourceManager, { DataSourceManager } from './source.manager';
import * as dataSources from './sources';

export {
  // Core services
  dataAcquisitionService,
  dataProcessingService,
  dataStorageService,
  
  // Data source management
  dataSourceManager,
  DataSourceManager,
  dataSources,
};
