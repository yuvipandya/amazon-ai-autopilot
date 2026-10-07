import { AmazonSearchTerm } from "./types";

export interface IAmazonReportingService {
  getSearchTerms(options: {
    profileId: string;
    startDate: string;
    endDate: string;
  }): Promise<AmazonSearchTerm[]>;
}
