export type UserRole = 'admin' | 'gestor' | 'analista';

export interface UserProfile {
  id: string;
  name: string;
  nome?: string;
  email: string;
  authProvider?: string;
  role: UserRole;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface ClientDependent {
  id: string;
  clientId: string;
  name: string;
  cpf: string;
  birthDate: string;
  relationship: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  code?: string;
  name: string;
  cpf: string;
  birthDate?: string;
  maritalStatus?: string;
  profession?: string;
  phone: string;
  whatsapp?: string;
  email: string;
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  addressDistrict?: string;
  addressCity?: string;
  addressState?: string;
  addressZipCode?: string;
  internalManagerId?: string;
  createdByUserId?: string;
  notes?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export type DeclarationStatus = 
  | 'new_service'
  | 'link_sent'
  | 'waiting_docs' 
  | 'docs_received'
  | 'screening' 
  | 'client_pending'
  | 'in_progress' 
  | 'review' 
  | 'ready_to_send'
  | 'transmitted' 
  | 'finalized'
  | 'archived';

export type DeclarationType = 'original' | 'rectifying';
export type DeclarationModel = 'simplified' | 'complete';

export interface Declaration {
  id: string;
  clientId: string;
  exerciseYear: number;
  calendarYear: number;
  declarationType: DeclarationType;
  obligationStatus: string;
  assignedToUserId?: string;
  createdByUserId?: string;
  openedAt: string;
  dueDate?: string;
  deliveredAt?: string;
  kanbanStage: DeclarationStatus;
  reviewStatus?: string;
  calculationModel: DeclarationModel;
  grossAmount: number;
  taxToPay: number;
  refundAmount: number;
  receiptNumber?: string;
  priorityLabel?: 'low' | 'medium' | 'high';
  hasCommission?: boolean;
  commissionPercentage?: number;
  isIncludedInMonthlyFee?: boolean;
  notes?: string;
  timeline?: {
    stage: string;
    timestamp: any;
    userId: string;
    userName: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface PricingHistory {
  id: string;
  clientId: string;
  declarationId: string;
  exerciseYear: number;
  grossAmount: number;
  discountAmount: number;
  finalAmount: number;
  paymentMethod?: string;
  dueDate: string;
  paidAt?: string;
  paymentStatus: 'pending' | 'paid' | 'partial';
  paidAmount?: number;
  createdByUserId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRequest {
  id: string;
  declarationId: string;
  clientId: string;
  token: string;
  publicLink?: string;
  dueDate: string;
  items: { 
    item: string; 
    status: 'pending' | 'received' | 'refused'; 
    comment?: string;
    clientObservation?: string;
  }[];
  generalObservation?: string;
  questions?: {
    id: string;
    text: string;
    answer?: string;
    answeredAt?: string;
  }[];
  status: 'pending' | 'partially_received' | 'completed';
  sentAt?: string;
  expiresAt?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  category: string;
  label: string;
  required: boolean;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistItem {
  id: string;
  requestId: string;
  declarationId: string;
  category?: string;
  label: string;
  required: boolean;
  status: 'pending' | 'received' | 'refused';
  reviewNote?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface UploadedFile {
  id: string;
  requestId?: string;
  declarationId?: string;
  checklistItemId?: string;
  clientId: string;
  fileNameOriginal: string;
  fileNameStored: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByType: 'client' | 'staff';
  uploadedByUserId?: string;
  uploadedAt: string;
  reviewStatus: 'pending' | 'approved' | 'refused';
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanHistory {
  id: string;
  declarationId: string;
  fromStage: string;
  toStage: string;
  movedByUserId: string;
  movedAt: string;
  comment?: string;
}

export interface DeclarationComment {
  id: string;
  declarationId: string;
  authorType: 'client' | 'staff';
  authorUserId: string;
  message: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  targetUserId: string;
  title: string;
  message: string;
  readAt?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: any;
}
