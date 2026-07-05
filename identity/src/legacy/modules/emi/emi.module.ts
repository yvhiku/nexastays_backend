/**
 * EMI Integration Module
 *
 * This module provides an abstraction layer for EMI (Electronic Money Institution)
 * integration. All fund movements (top-up, transfer, withdrawal) must go through
 * the EMI service.
 *
 * Architecture:
 * - IEMIProvider interface defines the contract for EMI operations
 * - EMIMockProvider implements the interface using internal ledger (default)
 * - Future real EMI providers can be swapped in without changing wallet logic
 *
 * Configuration:
 * - Set EMI_PROVIDER_TYPE env var to switch providers
 * - Default: 'mock' (internal ledger)
 * - Future: 'emi_partner_name' (real EMI integration)
 */

import { Module, DynamicModule, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EMI_PROVIDER } from './emi.interface';
import { EMIMockProvider } from './emi.mock.provider';
import { EMIService } from './emi.service';
import { LedgerModule } from '../ledger/ledger.module';
import { LedgerAccount } from '../ledger/entities/ledger-account.entity';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity';
import { LedgerTransaction } from '../ledger/entities/ledger-transaction.entity';
import { AuditModule } from '../audit/audit.module';

export type EMIProviderType = 'mock' | string;

export interface EMIModuleOptions {
  providerType?: EMIProviderType;
  providerConfig?: Record<string, unknown>;
}

@Module({})
export class EMIModule {
  private static readonly logger = new Logger(EMIModule.name);

  /**
   * Register EMI module with default configuration
   */
  static register(): DynamicModule {
    const providerType =
      (process.env.EMI_PROVIDER_TYPE as EMIProviderType) ?? 'mock';
    return this.forProvider(providerType);
  }

  /**
   * Register EMI module with specific provider
   */
  static forProvider(
    providerType: EMIProviderType,
    options?: EMIModuleOptions,
  ): DynamicModule {
    this.logger.log(`Registering EMI module with provider: ${providerType}`);

    const providerFactory = this.getProviderFactory(providerType, options);

    return {
      module: EMIModule,
      imports: [
        TypeOrmModule.forFeature([
          LedgerAccount,
          LedgerEntry,
          LedgerTransaction,
        ]),
        LedgerModule,
        AuditModule,
      ],
      providers: [
        providerFactory,
        EMIService,
        EMIMockProvider,
      ],
      exports: [EMIService, EMI_PROVIDER],
    };
  }

  /**
   * Get provider factory based on type
   */
  private static getProviderFactory(
    providerType: EMIProviderType,
    _options?: EMIModuleOptions,
  ) {
    switch (providerType) {
      case 'mock':
      default:
        this.logger.log('Using EMI Mock Provider (internal ledger)');
        return {
          provide: EMI_PROVIDER,
          useClass: EMIMockProvider,
        };

      // Future real EMI providers would be added here:
      // case 'partner_name':
      //   return {
      //     provide: EMI_PROVIDER,
      //     useClass: EMIPartnerNameProvider,
      //   };
    }
  }
}

/**
 * Re-export types and interfaces for convenience
 */
export * from './emi.types';
export * from './emi.interface';
export { EMIService } from './emi.service';
export { EMIMockProvider } from './emi.mock.provider';
