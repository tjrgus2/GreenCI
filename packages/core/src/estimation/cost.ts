import { findRunnerPrice, pricingDataset } from '../datasets/index.js';
import type { NormalizedJob, WorkflowRunIdentity } from '../domain/schemas.js';

/** Cost attribution for a single analyzed job. */
export interface JobCost {
  readonly jobId: number;
  readonly jobName: string;
  readonly runnerClass: string;
  readonly durationSeconds: number;
  readonly billableMinutes: number;
  readonly usdPerMinute: number | undefined;
  readonly grossListPriceUsd: number | undefined;
  readonly priced: boolean;
}

/**
 * Cost estimate for one workflow run.
 *
 * GreenCI cannot read a GitHub invoice, so the three figures below are kept
 * strictly separate and the actual invoice total is never claimed.
 */
export interface CostEstimate {
  readonly modelVersion: string;
  readonly currency: 'USD';
  readonly billableMinutes: number;
  readonly grossListPriceUsd: number;
  readonly estimatedBillableUsd: number;
  readonly billingBasis: 'standard-public-free' | 'list-price';
  readonly actualInvoiceAvailable: false;
  readonly pricedJobs: number;
  readonly unpricedJobs: number;
  readonly unknownRunnerClasses: readonly string[];
  readonly jobs: readonly JobCost[];
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Estimate runner cost with per-job minute rounding.
 *
 * GitHub rounds each job's partial minute up, so the total must be summed from
 * per-job rounded minutes and never from a single rounded run total.
 */
export function estimateCost(
  jobs: readonly NormalizedJob[],
  identity: Pick<WorkflowRunIdentity, 'repositoryVisibility'>,
): CostEstimate {
  const unknownRunnerClasses = new Set<string>();
  const jobCosts: JobCost[] = jobs.map((job) => {
    const durationSeconds = job.durationSeconds ?? 0;
    const billableMinutes = Math.ceil(Math.max(0, durationSeconds) / 60);
    const price = findRunnerPrice(job.runnerClass);
    if (price === undefined) {
      unknownRunnerClasses.add(job.runnerClass);
      return {
        jobId: job.id,
        jobName: job.apiName,
        runnerClass: job.runnerClass,
        durationSeconds,
        billableMinutes,
        usdPerMinute: undefined,
        grossListPriceUsd: undefined,
        priced: false,
      };
    }
    return {
      jobId: job.id,
      jobName: job.apiName,
      runnerClass: job.runnerClass,
      durationSeconds,
      billableMinutes,
      usdPerMinute: price.usdPerMinute,
      grossListPriceUsd: round(billableMinutes * price.usdPerMinute, 6),
      priced: true,
    };
  });

  const pricedJobs = jobCosts.filter((cost) => cost.priced);
  const grossListPriceUsd = round(
    pricedJobs.reduce(
      (total, cost) => total + (cost.grossListPriceUsd ?? 0),
      0,
    ),
    6,
  );
  const billableMinutes = pricedJobs.reduce(
    (total, cost) => total + cost.billableMinutes,
    0,
  );

  const allStandardPublicFree = pricedJobs.every((cost) => {
    const price = findRunnerPrice(cost.runnerClass);
    return price?.standardPublicFree === true;
  });
  const publicFree =
    identity.repositoryVisibility === 'public' &&
    pricedJobs.length > 0 &&
    allStandardPublicFree;

  return {
    modelVersion: pricingDataset.modelVersion,
    currency: 'USD',
    billableMinutes,
    grossListPriceUsd,
    estimatedBillableUsd: publicFree ? 0 : grossListPriceUsd,
    billingBasis: publicFree ? 'standard-public-free' : 'list-price',
    actualInvoiceAvailable: false,
    pricedJobs: pricedJobs.length,
    unpricedJobs: jobCosts.length - pricedJobs.length,
    unknownRunnerClasses: [...unknownRunnerClasses].sort(),
    jobs: jobCosts,
  };
}
