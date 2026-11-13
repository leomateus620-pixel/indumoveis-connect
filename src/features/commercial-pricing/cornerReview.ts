export type CornerClassification = "corner" | "regular" | "pending";

export type CommercialCornerReview = {
  lotNumber: number;
  geometryId: string;
  classification: CornerClassification;
  revision: number;
  source: {
    document: string;
    sourceSha256: string;
    frontage: string;
    intersection: string[] | null;
    envelopeSideStreet: string | null;
    originalEnvelopeId: string | null;
    basis: string;
  };
  reviews: {
    revision: number;
    classification: CornerClassification;
    evidence: string;
    reviewedAt: string;
  }[];
};
