# 📚 Tài liệu luồng NẠP TIỀN - RÚT TIỀN - HOÀN TIỀN - AFFILIATE

## Mục lục
- [1. Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
- [2. Luồng NẠP TIỀN (Deposit)](#2-luồng-nạp-tiền-deposit)
- [3. Luồng RÚT TIỀN (Withdrawal)](#3-luồng-rút-tiền-withdrawal)
- [4. Luồng HOÀN TIỀN (Refund)](#4-luồng-hoàn-tiền-refund)
- [5. Luồng AFFILIATE](#5-luồng-affiliate)
- [6. Cấu trúc Database](#6-cấu-trúc-database)
- [7. API Endpoints](#7-api-endpoints)

---

## 1. Tổng quan kiến trúc

### 1.1 Các module liên quan

```
lms-backend/src/modules/
├── transactions/           # Nạp tiền, rút tiền
│   ├── entities/
│   │   ├── transactions.entity.ts
│   │   ├── withdrawal-request.entity.ts
│   │   └── deposit-complaint.entity.ts
│   ├── transactions.controller.ts
│   ├── transactions.service.ts
│   ├── withdrawal.controller.ts
│   └── withdrawal.service.ts
├── refunds/               # Hoàn tiền
│   ├── entities/
│   │   └── refund.entity.ts
│   ├── refunds.controller.ts
│   └── refunds.service.ts
├── affiliate/             # Tiếp thị liên kết
│   ├── entities/
│   │   ├── affiliate-link.entity.ts
│   │   ├── affiliate-click.entity.ts
│   │   └── affiliate-transaction.entity.ts
│   ├── affiliate.controller.ts
│   └── affiliate.service.ts
└── enrollments/           # Đăng ký khóa học (trigger affiliate)
    └── enrollments.service.ts
```

### 1.2 Các trường quan trọng trong User entity

```typescript
// User entity
{
  wallet_balance: number;    // Số dư ví - có thể rút/tiêu
  locked_balance: number;    // Số dư tạm khóa - chờ release
}
```

---

## 2. Luồng NẠP TIỀN (Deposit)

### 2.1 Sequence Diagram

```
┌─────────┐     ┌─────────────┐     ┌───────┐     ┌────────┐     ┌──────────┐
│ Learner │     │   Backend   │     │ Redis │     │ SePay  │     │    DB    │
└────┬────┘     └──────┬──────┘     └───┬───┘     └───┬────┘     └────┬─────┘
     │                 │                │             │                │
     │ 1. Tạo giao dịch│                │             │                │
     │────────────────>│                │             │                │
     │                 │                │             │                │
     │                 │ 2. Lưu pending │             │                │
     │                 │───────────────>│             │                │
     │                 │                │             │                │
     │ 3. Trả QR Code  │                │             │                │
     │<────────────────│                │             │                │
     │                 │                │             │                │
     │   4. User quét QR và chuyển tiền │             │                │
     │─────────────────────────────────────────────>│                │
     │                 │                │             │                │
     │                 │ 5. Webhook callback         │                │
     │                 │<────────────────────────────│                │
     │                 │                │             │                │
     │                 │ 6. Get pending │             │                │
     │                 │<───────────────│             │                │
     │                 │                │             │                │
     │                 │ 7. Increment wallet_balance │                │
     │                 │──────────────────────────────────────────────>│
     │                 │                │             │                │
     │                 │ 8. Save transaction record  │                │
     │                 │──────────────────────────────────────────────>│
     │                 │                │             │                │
     │ 9. Socket: balance_update + transaction_deposit_completed      │
     │<────────────────│                │             │                │
     │                 │                │             │                │
```

### 2.2 Chi tiết API

#### 2.2.1 Tạo giao dịch nạp tiền

**Backend API:**
```
POST /transactions/create
Body: { userId: number, amount: number }
Role: LEARNER
```

**Backend Service:**
```typescript
// transactions.service.ts - createTransaction()
async createTransaction(dto: CreateTransactionDto) {
  // 1. Tạo orderCode unique
  const rawOrderCode = crypto.randomUUID();
  const orderCode = rawOrderCode.replace(/-/g, '');
  
  // 2. Tạo description cho bank transfer
  const description = `topupuser${dto.userId}orderCode${orderCode}`;
  
  // 3. Tạo QR URL từ SePay
  const qrUrl = `https://qr.sepay.vn/img?acc=${SEPAY_ACCOUNT_NUMBER}&bank=${SEPAY_BANK_CODE}&amount=${dto.amount}&des=${description}`;
  
  // 4. Lưu vào Redis với TTL 5 phút
  const redisKey = `transaction:pending:${orderCode}`;
  await this.redis.setex(redisKey, 3000, JSON.stringify({
    userId: dto.userId,
    amount: dto.amount,
    qrUrl,
  }));
  
  return { qrUrl, orderCode };
}
```

#### 2.2.2 Webhook nhận thông báo từ SePay

**API:**
```
POST /transactions/webhook/deposit
Headers: { Authorization: 'Apikey xxx' }
Body: SepayWebhookDto
```

**Backend Service:**
```typescript
// transactions.service.ts - handleWebhookDeposit()
async handleWebhookDeposit(req: Request, body: any) {
  // 1. Verify API key
  const apiKey = req.headers['authorization']?.replace('Apikey ', '');
  if (apiKey !== process.env.API_KEY) throw UnauthorizedException;
  
  // 2. Parse transaction info từ content
  const userIdMatch = transactionContent.match(/topupuser(\d+)/);
  const orderCodeMatch = transactionContent.match(/orderCode([a-z0-9-]+)/i);
  
  // 3. Lấy pending từ Redis
  const pendingData = await this.redis.get(`transaction:pending:${orderCode}`);
  
  // 4. Verify amount
  if (pendingTx.amount !== amount) {
    // Save failed transaction
    await this.transactionRepository.save({ status: 'failed', ... });
    return { success: false };
  }
  
  // 5. Transaction: cộng tiền + save record
  await this.dataSource.transaction(async (manager) => {
    // Increment wallet_balance
    await manager.increment(User, { id: userId }, 'wallet_balance', amount);
    
    // Save transaction record
    await manager.save(Transaction, {
      orderCode, amount, userId,
      status: TransactionStatus.COMPLETED,
      type: TransactionType.DEPOSIT,
    });
  });
  
  // 6. Delete Redis key
  await this.redis.del(redisKey);
  
  // 7. Socket notification
  this.socketGateway.sendBalanceUpdate(userId, newBalance, lockedBalance);
  this.socketGateway.server.to(userId.toString()).emit('transaction_deposit_completed', {...});
  
  // 8. Create notification
  await this.notificationService.createNotification({
    user_id: userId,
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    title: 'Nạp tiền thành công',
    message: `Đã nạp ${amount} vào ví`,
  });
}
```

### 2.3 Database Changes

| Table | Field | Change |
|-------|-------|--------|
| `users` | `wallet_balance` | +amount |
| `transactions` | new record | status: completed, type: deposit |

---

## 3. Luồng RÚT TIỀN (Withdrawal)

### 3.1 Sequence Diagram

```
┌─────────┐     ┌─────────────┐     ┌────────┐     ┌──────────┐
│  User   │     │   Backend   │     │  Mail  │     │    DB    │
└────┬────┘     └──────┬──────┘     └───┬────┘     └────┬─────┘
     │                 │                │                │
     │ 1. Tạo yêu cầu rút tiền         │                │
     │────────────────>│                │                │
     │                 │                │                │
     │                 │ 2. Validate bank info          │
     │                 │────────────────────────────────>│
     │                 │                │                │
     │                 │ 3. Generate OTP & save         │
     │                 │────────────────────────────────>│
     │                 │                │                │
     │                 │ 4. Send OTP email              │
     │                 │───────────────>│                │
     │                 │                │                │
     │ 5. Trả requestCode              │                │
     │<────────────────│                │                │
     │                 │                │                │
     │ 6. Verify OTP   │                │                │
     │────────────────>│                │                │
     │                 │                │                │
     │                 │ 7. Trừ wallet_balance          │
     │                 │────────────────────────────────>│
     │                 │                │                │
     │                 │ 8. Update status = PENDING     │
     │                 │────────────────────────────────>│
     │                 │                │                │
     │ 9. Socket: balance_update       │                │
     │<────────────────│                │                │
     │                 │                │                │
     │ === ADMIN FLOW ===              │                │
     │                 │                │                │
     │ 10. Admin approve/reject        │                │
     │────────────────>│                │                │
     │                 │                │                │
     │                 │ 11a. APPROVED: status=COMPLETED│
     │                 │ 11b. REJECTED: refund wallet   │
     │                 │────────────────────────────────>│
     │                 │                │                │
     │ 12. Email + Notification        │                │
     │<────────────────│<──────────────│                │
```

### 3.2 Status Flow

```
WAITING ──(OTP verified)──> PENDING ──(Admin approve)──> COMPLETED
    │                           │
    │                           └──(Admin reject)──> REJECTED (refund)
    │
    └──(User cancel)──> CANCELLED
```

### 3.3 Chi tiết API

#### 3.3.1 Tạo yêu cầu rút tiền

**Frontend Call:**
```typescript
// lms-frontend-learner/src/services/transactions/transactionAPI.ts
createWithdrawalRequest: (data: CreateWithdrawalRequest) => {
  return apiClient.post("/transactions/withdrawals", data);
}

// lms-frontend-teacher/src/api/withdrawal/withdrawalApi.ts
createWithdrawalRequest: async (data: CreateWithdrawalRequest) => {
  return apiClient.post("/transactions/withdrawals", data);
}
```

**Backend API:**
```
POST /transactions/withdrawals
Body: { amount: number }
Role: LEARNER, TEACHER
```

**Backend Service:**
```typescript
// withdrawal.service.ts - createWithdrawalRequest()
async createWithdrawalRequest(userId: number, dto: CreateWithdrawalRequestDto) {
  // 1. Check user exists + có bank info
  if (!user.bank_account_name || !user.bank_account_number || !user.bank_name) {
    throw BadRequestException('Chưa cập nhật thông tin ngân hàng');
  }
  
  // 2. Check balance
  if (dto.amount > user.wallet_balance) {
    throw BadRequestException('Số dư không đủ');
  }
  
  // 3. Generate OTP (6 digits)
  const otpCode = generateVerificationCode();
  const otpExpiresAt = new Date();
  otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 5);
  
  // 4. Create withdrawal request với status = WAITING
  const withdrawalRequest = this.withdrawalRepository.create({
    requestCode: this.generateRequestCode(), // WD-YYYYMMDD-XXXXX
    amount: dto.amount,
    userId,
    bankAccountName: user.bank_account_name,
    bankAccountNumber: user.bank_account_number,
    bankName: user.bank_name,
    otpCode,
    otpExpiresAt,
    status: WithdrawalStatus.WAITING,
  });
  
  // 5. Send OTP via email
  await this.mailService.sendWithdrawalOtp(user.email, otpCode);
  
  return { requestCode, message: 'OTP đã được gửi' };
}
```

#### 3.3.2 Verify OTP

**Frontend Call:**
```typescript
verifyWithdrawalOTP: (data: VerifyWithdrawalOTP) => {
  return apiClient.post("/transactions/withdrawals/verify-otp", data);
}
```

**Backend API:**
```
POST /transactions/withdrawals/verify-otp
Body: { requestCode: string, otpCode: string }
```

**Backend Service:**
```typescript
// withdrawal.service.ts - verifyOtp()
async verifyOtp(dto: VerifyWithdrawalOtpDto) {
  // 1. Find withdrawal request
  // 2. Check OTP not expired & correct
  // 3. Check balance again
  
  // 4. TRƯỚC KHI VERIFY - Trừ tiền ngay
  user.wallet_balance = Number(user.wallet_balance) - Number(withdrawalRequest.amount);
  await this.userRepository.save(user);
  
  // 5. Update status = PENDING
  withdrawalRequest.otpVerified = true;
  withdrawalRequest.status = WithdrawalStatus.PENDING;
  
  // 6. Socket balance update
  this.socketGateway.sendBalanceUpdate(user.id, newBalance, lockedBalance);
  
  // 7. Notify admin
  await this.notificationService.createAdminNotification({
    type: NotificationType.WITHDRAWAL_REQUEST,
    message: 'Có yêu cầu rút tiền mới',
  });
}
```

#### 3.3.3 Admin Approve

**Frontend Call (Manager):**
```typescript
// lms-frontend-manager/src/api/transaction/transactionApi.ts
approveWithdrawal: async (id: number, data: { proofImageUrl?: string; adminNote?: string }) => {
  return apiClient.put(`/transactions/withdrawals/${id}/approve`, data);
}
```

**Backend API:**
```
PUT /transactions/withdrawals/:id/approve
Body: { proofImageUrl?: string, adminNote?: string }
Role: ADMIN1
```

**Backend Service:**
```typescript
// withdrawal.service.ts - approveWithdrawal()
async approveWithdrawal(id: number, adminId: number, dto: ProcessWithdrawalDto) {
  // 1. Check status = PENDING
  // 2. Check OTP verified
  
  // 3. Update status = COMPLETED (tiền đã trừ ở bước verify OTP)
  withdrawal.status = WithdrawalStatus.COMPLETED;
  withdrawal.processedBy = adminId;
  withdrawal.processedAt = new Date();
  withdrawal.proofImageUrl = dto.proofImageUrl;
  
  // 4. Send notification + email
  await this.notificationService.createNotification({...});
  await this.mailService.sendWithdrawalApproved(user.email, amount);
  
  // 5. Socket to user
  this.socketGateway.emitToUser(user.id, 'withdrawalApproved', {...});
}
```

#### 3.3.4 Admin Reject

**Frontend Call (Manager):**
```typescript
rejectWithdrawal: async (id: number, data: { reason: string }) => {
  return apiClient.put(`/transactions/withdrawals/${id}/reject`, data);
}
```

**Backend Service:**
```typescript
// withdrawal.service.ts - rejectWithdrawal()
async rejectWithdrawal(id: number, adminId: number, dto: RejectWithdrawalDto) {
  // 1. HOÀN TIỀN về ví (vì đã trừ ở bước verify OTP)
  user.wallet_balance = Number(user.wallet_balance) + Number(withdrawal.amount);
  await this.userRepository.save(user);
  
  // 2. Socket balance update
  this.socketGateway.sendBalanceUpdate(user.id, newBalance, lockedBalance);
  
  // 3. Update status = REJECTED
  withdrawal.status = WithdrawalStatus.REJECTED;
  withdrawal.adminNote = dto.reason;
  
  // 4. Send notification + email
}
```

### 3.4 Database Changes

| Step | Table | Field | Change |
|------|-------|-------|--------|
| Create | `withdrawal_requests` | new record | status: waiting |
| Verify OTP | `users` | `wallet_balance` | -amount |
| Verify OTP | `withdrawal_requests` | `status` | → pending |
| Approve | `withdrawal_requests` | `status` | → completed |
| Reject | `users` | `wallet_balance` | +amount (refund) |
| Reject | `withdrawal_requests` | `status` | → rejected |

---

## 4. Luồng HOÀN TIỀN (Refund)

### 4.1 Điều kiện hoàn tiền

- Learner đã đăng ký khóa học (enrollment.status = ACTIVE)
- Thời gian từ lúc đăng ký <= **30 phút**
- Chưa có refund request pending/approved cho enrollment này
- Learner đã cập nhật thông tin ngân hàng

### 4.2 Sequence Diagram

```
┌─────────┐     ┌─────────────┐     ┌──────────┐     ┌─────────┐     ┌──────────┐
│ Learner │     │   Backend   │     │    DB    │     │ Teacher │     │  Admin   │
└────┬────┘     └──────┬──────┘     └────┬─────┘     └────┬────┘     └────┬─────┘
     │                 │                 │                │                │
     │ 1. Request refund                │                │                │
     │────────────────>│                 │                │                │
     │                 │                 │                │                │
     │                 │ 2. Validate (30min window)      │                │
     │                 │────────────────>│                │                │
     │                 │                 │                │                │
     │                 │ 3. Create refund (status=pending)                │
     │                 │────────────────>│                │                │
     │                 │                 │                │                │
     │                 │ 4. Notify admin │                │                │
     │                 │─────────────────────────────────────────────────>│
     │                 │                 │                │                │
     │ 5. Trả kết quả  │                │                │                │
     │<────────────────│                 │                │                │
     │                 │                 │                │                │
     │ === ADMIN APPROVE ===             │                │                │
     │                 │                 │                │                │
     │                 │ 6. Admin approve│                │                │
     │                 │<────────────────────────────────────────────────│
     │                 │                 │                │                │
     │                 │ 7. Cancel enrollment            │                │
     │                 │────────────────>│                │                │
     │                 │                 │                │                │
     │                 │ 8. Refund to learner wallet     │                │
     │                 │────────────────>│                │                │
     │                 │                 │                │                │
     │                 │ 9. Cancel affiliate commission  │                │
     │                 │────────────────>│                │                │
     │                 │                 │                │                │
     │                 │ 10. Reverse teacher revenue     │                │
     │                 │────────────────>│                │                │
     │                 │                 │                │                │
     │ 11. Notify learner               │                │                │
     │<────────────────│                 │                │                │
     │                 │                 │                │                │
     │                 │ 12. Notify teacher              │                │
     │                 │─────────────────────────────────>│                │
```

### 4.3 Chi tiết API

#### 4.3.1 Request Refund

**Frontend Call:**
```typescript
// lms-frontend-learner/src/services/refund/refundService.ts
async requestRefund(data: RefundRequest) {
  return apiClient.post("/refunds/request", data);
}
```

**Backend API:**
```
POST /refunds/request
Body: {
  courseId: number,
  reason: RefundReason,
  detail: string
}
Role: LEARNER
```

**Backend Service:**
```typescript
// refunds.service.ts - requestRefund()
async requestRefund(userId: number, dto: CreateRefundDto) {
  // 1. Check bank info
  if (!user.bank_account_name || !user.bank_account_number || !user.bank_name) {
    throw BadRequestException('Chưa cập nhật thông tin ngân hàng');
  }
  
  // 2. Find active enrollment
  const enrollment = await this.enrollmentRepository.findOne({
    where: { user_id: userId, course_id: courseId, status: 'active' }
  });
  
  // 3. Check 30 minute window
  const enrollmentTime = new Date(enrollment.enrolled_at).getTime();
  const minutesPassed = (Date.now() - enrollmentTime) / (1000 * 60);
  if (minutesPassed > 30) {
    throw BadRequestException('Đã quá thời gian hoàn tiền (30 phút)');
  }
  
  // 4. Check existing refund
  const existingRefund = await this.refundRepository.findOne({
    where: { enrollment_id: enrollment.id }
  });
  if (existingRefund?.status === 'pending' || existingRefund?.status === 'approved') {
    throw BadRequestException('Đã có yêu cầu hoàn tiền');
  }
  
  // 5. Create refund request
  const refund = this.refundRepository.create({
    user_id: userId,
    course_id: courseId,
    enrollment_id: enrollment.id,
    reason: dto.reason,
    detail: dto.detail,
    refund_amount: enrollment.paid_amount,
    status: RefundStatus.PENDING,
  });
  
  // 6. Notify admin
  await this.notificationService.createAdminNotification({
    type: NotificationType.REFUND_REQUEST,
    message: `${user.full_name} yêu cầu hoàn tiền ${enrollment.paid_amount}`,
  });
  
  // 7. Socket to admin
  this.socketGateway.emitToAdmin('refundRequest', {...});
}
```

#### 4.3.2 Admin Process Refund

**Frontend Call (Manager):**
```typescript
// lms-frontend-manager/src/api/refund/refundApi.ts
processRefund: async (refundId: number, data: ProcessRefundDto) => {
  return apiClient.put(`/refunds/${refundId}/process`, data);
}
```

**Backend API:**
```
PUT /refunds/:refundId/process
Body: {
  status: 'approved' | 'rejected',
  admin_note?: string,
  proof_image_url?: string
}
Role: ADMIN1
```

**Backend Service:**
```typescript
// refunds.service.ts - processRefund()
async processRefund(refundId: number, adminId: number, dto: ProcessRefundDto) {
  if (dto.status === RefundStatus.APPROVED) {
    // 1. Cancel enrollment
    await this.enrollmentRepository.update(refund.enrollment_id, {
      status: EnrollmentStatus.CANCELLED,
    });
    
    // 2. Refund to learner wallet
    await this.userRepository.increment(
      { id: refund.user_id },
      'wallet_balance',
      Number(refund.refund_amount)
    );
    
    // 3. Cancel affiliate commission (nếu có)
    await this.affiliateService.cancelAffiliateCommission(
      refund.enrollment_id,
      'Enrollment refunded'
    );
    
    // 4. Reverse teacher revenue (trừ từ locked_balance)
    await this.enrollmentsService.reverseTeacherRevenue(refund.enrollment_id);
    
    // 5. Socket balance update to learner
    this.socketGateway.sendBalanceUpdate(learner.id, newBalance, lockedBalance);
    
    // 6. Notify learner
    await this.notificationService.createNotification({
      user_id: refund.user_id,
      type: NotificationType.REFUND_APPROVED,
      title: 'Hoàn tiền thành công',
      message: `Đã hoàn ${refund.refund_amount} cho khóa học ${course.title}`,
    });
    
    // 7. Notify teacher
    await this.notificationService.createNotification({
      user_id: course.teacher_id,
      type: NotificationType.REFUND_APPROVED,
      title: 'Học viên hoàn tiền',
      message: `${learner.full_name} đã hoàn tiền khóa ${course.title}`,
    });
    
  } else {
    // REJECTED - just notify
    await this.notificationService.createNotification({
      user_id: refund.user_id,
      type: NotificationType.REFUND_REJECTED,
      message: `Yêu cầu hoàn tiền bị từ chối: ${dto.admin_note}`,
    });
  }
}
```

### 4.4 Database Changes (Khi APPROVE)

| Table | Field | Change |
|-------|-------|--------|
| `refunds` | `status` | → approved |
| `enrollments` | `status` | → cancelled |
| `users` (learner) | `wallet_balance` | +refund_amount |
| `users` (teacher) | `locked_balance` | -70% of paid_amount |
| `affiliate_transactions` | `status` | → CANCELED |
| `users` (referrer) | `locked_balance` | -10% of paid_amount |

---

## 5. Luồng AFFILIATE

### 5.1 Tổng quan

```
Người giới thiệu (Referrer) → Tạo link → Chia sẻ
                                            ↓
                                    Người mua click
                                            ↓
                                    Người mua đăng ký khóa học
                                            ↓
                        Affiliate commission được tạo (PENDING)
                                            ↓
                            Sau 30 phút → RELEASED → vào wallet
```

### 5.2 Phân chia doanh thu

| Vai trò | Tỷ lệ | Ghi chú |
|---------|-------|---------|
| Teacher | 70% | → locked_balance → wallet (sau 30 phút) |
| Affiliate (Referrer) | 10% | → locked_balance → wallet (sau 30 phút) |
| Platform | 20% | Giữ lại |

### 5.3 Sequence Diagram

```
┌──────────┐     ┌──────────┐     ┌─────────────┐     ┌──────────┐
│ Referrer │     │  Buyer   │     │   Backend   │     │    DB    │
└────┬─────┘     └────┬─────┘     └──────┬──────┘     └────┬─────┘
     │                │                  │                 │
     │ 1. Tạo link affiliate             │                 │
     │───────────────────────────────────>│                 │
     │                │                  │                 │
     │                │                  │ 2. Generate code│
     │                │                  │────────────────>│
     │                │                  │                 │
     │ 3. Return link URL               │                 │
     │<───────────────────────────────────│                 │
     │                │                  │                 │
     │ 4. Chia sẻ link│                  │                 │
     │───────────────>│                  │                 │
     │                │                  │                 │
     │                │ 5. Click link    │                 │
     │                │─────────────────>│                 │
     │                │                  │                 │
     │                │                  │ 6. Track click  │
     │                │                  │────────────────>│
     │                │                  │                 │
     │                │ 7. Mua khóa học  │                 │
     │                │─────────────────>│                 │
     │                │                  │                 │
     │                │                  │ 8. Create enrollment
     │                │                  │ với referrer_id │
     │                │                  │────────────────>│
     │                │                  │                 │
     │                │                  │ 9. processAffiliateCommission()
     │                │                  │────────────────>│
     │                │                  │                 │
     │                │                  │ 10. +10% to referrer locked_balance
     │                │                  │────────────────>│
     │                │                  │                 │
     │ 11. Notification: commission earned                │
     │<───────────────────────────────────│                 │
     │                │                  │                 │
     │ === SAU 30 PHÚT (Scheduler) ===   │                 │
     │                │                  │                 │
     │                │                  │ 12. Release commission
     │                │                  │ locked → wallet │
     │                │                  │────────────────>│
```

### 5.4 Chi tiết API

#### 5.4.1 Tạo link affiliate

**Frontend Call:**
```typescript
// lms-frontend-learner/src/services/affiliate.ts
export const createAffiliateLink = async (courseId: number): Promise<AffiliateLink> => {
  const { data } = await apiClient.post('/affiliate/links', { course_id: courseId });
  return data.data;
};
```

**Backend API:**
```
POST /affiliate/links
Body: { course_id: number }
Role: Authenticated user
```

**Backend Service:**
```typescript
// affiliate.service.ts - createLink()
async createLink(userId: number, courseId: number) {
  // 1. Check khóa học có bật affiliate không
  if (!course.affiliate_enabled) {
    throw BadRequestException('Khóa học không cho phép affiliate');
  }
  
  // 2. Kiểm tra đã tạo link chưa
  let link = await this.affiliateLinkRepository.findOne({
    where: { referrer_id: userId, course_id: courseId }
  });
  
  if (!link) {
    // 3. Tạo code 8 ký tự
    const code = this.generateCode(); // e.g., "AB12CD34"
    
    link = this.affiliateLinkRepository.create({
      referrer_id: userId,
      course_id: courseId,
      code: code,
    });
    await this.affiliateLinkRepository.save(link);
  }
  
  // 4. Return URLs
  return {
    link_id: link.id,
    url: `${LEARNER_FRONTEND_URL}/courses/${course.slug}?aff=${link.code}`,
    shortUrl: `${LEARNER_FRONTEND_URL}/r/${link.code}`,
    code: link.code,
    clicks: link.clicks_count,
    conversions: link.conversions_count,
  };
}
```

#### 5.4.2 Track click

**Frontend Call:**
```typescript
export const trackAffiliateClickByCode = async (code: string) => {
  const { data } = await apiClient.post('/affiliate/track-click-by-code', { code });
  return data.data;
};
```

**Backend API:**
```
POST /affiliate/track-click-by-code
Body: { code: string }
Public
```

**Backend Service:**
```typescript
// affiliate.service.ts - trackClickByCode()
async trackClickByCode(code: string, ip: string, userAgent: string) {
  const link = await this.getLinkByCode(code);
  
  // Rate limit: max 10 clicks/hour/IP/link
  const recentClicks = await this.affiliateClickRepository.count({
    where: { link_id: link.id, ip_address: ip, clicked_at: MoreThan(oneHourAgo) }
  });
  if (recentClicks > 10) return { message: 'Too many clicks' };
  
  // Save click
  await this.affiliateClickRepository.save({
    link_id: link.id,
    ip_address: ip,
    user_agent: userAgent,
  });
  
  // Increment count
  await this.affiliateLinkRepository.increment({ id: link.id }, 'clicks_count', 1);
}
```

#### 5.4.3 Process Affiliate Commission (Internal)

**Được gọi từ `EnrollmentsService` khi có enrollment mới:**

```typescript
// enrollments.service.ts
if (savedEnrollment.referrer_id) {
  this.affiliateService.processAffiliateCommission(savedEnrollment.id).catch(() => {});
}
```

**Backend Service:**
```typescript
// affiliate.service.ts - processAffiliateCommission()
async processAffiliateCommission(enrollmentId: number) {
  const enrollment = await this.enrollmentRepository.findOne({
    where: { id: enrollmentId },
    relations: ['course', 'user'],
  });
  
  // Validations
  if (!enrollment.referrer_id) return;
  if (enrollment.referrer_id === enrollment.user_id) return; // Chặn tự mua
  if (!enrollment.course.affiliate_enabled) return;
  
  // Check existing
  const existing = await this.affiliateTransactionRepository.findOne({
    where: { order_id: enrollment.id }
  });
  if (existing) return;
  
  // Calculate commission (fixed 10%)
  const commissionRate = 10;
  const orderAmount = Number(enrollment.paid_amount);
  const commissionAmount = (orderAmount * commissionRate) / 100;
  
  // Hold time: 30 minutes
  const holdUntil = new Date();
  holdUntil.setMinutes(holdUntil.getMinutes() + 30);
  
  await this.dataSource.transaction(async (manager) => {
    // 1. Create affiliate transaction
    const affTrans = manager.create(AffiliateTransaction, {
      order_id: enrollment.id,
      link_id: enrollment.ref_link_id,
      referrer_id: enrollment.referrer_id,
      buyer_id: enrollment.user_id,
      course_id: enrollment.course_id,
      order_amount: orderAmount,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      status: AffiliateTransactionStatus.PENDING,
      hold_until: holdUntil,
    });
    await manager.save(affTrans);
    
    // 2. Add to referrer's locked_balance
    const referrer = await manager.findOne(User, { where: { id: enrollment.referrer_id } });
    referrer.locked_balance = Number(referrer.locked_balance || 0) + commissionAmount;
    await manager.save(referrer);
    
    // 3. Create transaction record
    const transaction = manager.create(Transaction, {
      orderCode: `AFFILIATE-${affTrans.id}`,
      amount: commissionAmount,
      user: { id: referrer.id },
      status: TransactionStatus.COMPLETED,
      type: TransactionType.AFFILIATE_COMMISSION,
    });
    await manager.save(transaction);
    
    // 4. Update link stats
    await manager.increment(AffiliateLink, { id: enrollment.ref_link_id }, 'conversions_count', 1);
    
    // 5. Notify referrer
    await this.notificationService.createNotification({
      user_id: referrer.id,
      type: NotificationType.AFFILIATE_COMMISSION_EARNED,
      message: `Bạn nhận được ${commissionAmount} hoa hồng từ khóa học "${course.title}"`,
    });
  });
}
```

#### 5.4.4 Cancel Affiliate Commission (Khi refund)

```typescript
// affiliate.service.ts - cancelAffiliateCommission()
async cancelAffiliateCommission(enrollmentId: number, reason: string) {
  const affTrans = await this.affiliateTransactionRepository.findOne({
    where: { order_id: enrollmentId }
  });
  
  if (!affTrans || affTrans.status === AffiliateTransactionStatus.CANCELED) return;
  
  // Check tiền đang ở đâu
  const isReleased = affTrans.status === AffiliateTransactionStatus.RELEASED;
  const hasHoldTime = affTrans.hold_until && affTrans.hold_until > new Date();
  
  await this.dataSource.transaction(async (manager) => {
    // Update status
    affTrans.status = AffiliateTransactionStatus.CANCELED;
    affTrans.canceled_reason = reason;
    await manager.save(affTrans);
    
    // Trừ tiền
    const user = await manager.findOne(User, { where: { id: affTrans.referrer_id } });
    if (isReleased && !hasHoldTime) {
      // Tiền đã vào wallet
      user.wallet_balance = Math.max(0, Number(user.wallet_balance) - Number(affTrans.commission_amount));
    } else {
      // Tiền còn trong locked
      user.locked_balance = Math.max(0, Number(user.locked_balance) - Number(affTrans.commission_amount));
    }
    await manager.save(user);
  });
  
  // Notify referrer
  await this.notificationService.createNotification({
    user_id: affTrans.referrer_id,
    type: NotificationType.AFFILIATE_COMMISSION_CANCELLED,
    message: `Hoa hồng ${affTrans.commission_amount} bị hủy do: ${reason}`,
  });
}
```

### 5.5 Database Changes

| Event | Table | Field | Change |
|-------|-------|-------|--------|
| Create link | `affiliate_links` | new record | status: ACTIVE |
| Track click | `affiliate_clicks` | new record | |
| Track click | `affiliate_links` | `clicks_count` | +1 |
| Enrollment | `affiliate_transactions` | new record | status: PENDING |
| Enrollment | `users` (referrer) | `locked_balance` | +10% |
| Enrollment | `affiliate_links` | `conversions_count` | +1 |
| Release (30min) | `affiliate_transactions` | `status` | → RELEASED |
| Release (30min) | `users` (referrer) | `locked_balance` | -commission |
| Release (30min) | `users` (referrer) | `wallet_balance` | +commission |
| Cancel (refund) | `affiliate_transactions` | `status` | → CANCELED |
| Cancel (refund) | `users` (referrer) | `locked_balance` or `wallet_balance` | -commission |

---

## 6. Cấu trúc Database

### 6.1 Entity: Transaction

```typescript
// transactions.entity.ts
@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true, nullable: true })
  orderCode: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: TransactionStatus })
  status: TransactionStatus; // pending | completed | failed

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType; // deposit | withdrawal | course_purchase | refund | affiliate_commission

  @Column()
  qrUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  user: User;
}
```

### 6.2 Entity: WithdrawalRequest

```typescript
// withdrawal-request.entity.ts
@Entity('withdrawal_requests')
export class WithdrawalRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  requestCode: string; // WD-YYYYMMDD-XXXXX

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: WithdrawalStatus })
  status: WithdrawalStatus; // waiting | pending | approved | rejected | completed | cancelled

  @Column()
  bankAccountName: string;

  @Column()
  bankAccountNumber: string;

  @Column()
  bankName: string;

  @Column({ nullable: true })
  otpCode?: string;

  @Column({ nullable: true })
  otpExpiresAt?: Date;

  @Column({ default: false })
  otpVerified: boolean;

  @Column({ nullable: true })
  processedBy?: number;

  @Column({ nullable: true })
  adminNote?: string;

  @Column({ nullable: true })
  proofImageUrl?: string;

  @Column({ nullable: true })
  processedAt?: Date;

  @ManyToOne(() => User)
  user: User;

  @Column()
  userId: number;
}
```

### 6.3 Entity: Refund

```typescript
// refund.entity.ts
@Entity('refunds')
export class Refund {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  course_id: number;

  @Column()
  enrollment_id: number;

  @Column({ type: 'enum', enum: RefundReason })
  reason: RefundReason;

  @Column({ nullable: true })
  detail: string | null;

  @Column({ type: 'enum', enum: RefundStatus })
  status: RefundStatus; // pending | approved | rejected

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  refund_amount: number;

  @Column({ nullable: true })
  admin_note: string | null;

  @Column({ nullable: true })
  proof_image_url: string | null;

  @Column({ nullable: true })
  processed_by: number;

  @Column({ nullable: true })
  processed_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User)
  user: User;

  @ManyToOne(() => Course)
  course: Course;

  @ManyToOne(() => Enrollment)
  enrollment: Enrollment;

  @ManyToOne(() => User)
  processedBy: User;
}
```

### 6.4 Entity: AffiliateTransaction

```typescript
// affiliate-transaction.entity.ts
@Entity('affiliate_transactions')
export class AffiliateTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  order_id: number; // enrollment_id

  @Column()
  link_id: number;

  @Column()
  referrer_id: number;

  @Column()
  buyer_id: number;

  @Column()
  course_id: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  order_amount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  commission_rate: number; // 10

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  commission_amount: number;

  @Column({ type: 'enum', enum: AffiliateTransactionStatus })
  status: AffiliateTransactionStatus; // PENDING | RELEASED | CANCELED

  @Column({ nullable: true })
  hold_until: Date;

  @Column({ nullable: true })
  confirmed_at: Date;

  @Column({ nullable: true })
  canceled_reason: string;

  @ManyToOne(() => Enrollment)
  enrollment: Enrollment;

  @ManyToOne(() => AffiliateLink)
  link: AffiliateLink;

  @ManyToOne(() => User)
  referrer: User;

  @ManyToOne(() => User)
  buyer: User;

  @ManyToOne(() => Course)
  course: Course;
}
```

### 6.5 Entity: AffiliateLink

```typescript
// affiliate-link.entity.ts
@Entity('affiliate_links')
export class AffiliateLink {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  referrer_id: number;

  @Column()
  course_id: number;

  @Column({ unique: true })
  code: string; // 8 chars: AB12CD34

  @Column({ default: 0 })
  clicks_count: number;

  @Column({ default: 0 })
  conversions_count: number;

  @Column({ default: 'ACTIVE' })
  status: string;

  @ManyToOne(() => User)
  referrer: User;

  @ManyToOne(() => Course)
  course: Course;

  @OneToMany(() => AffiliateClick, click => click.link)
  clicks: AffiliateClick[];

  @OneToMany(() => AffiliateTransaction, transaction => transaction.link)
  transactions: AffiliateTransaction[];
}
```

---

## 7. API Endpoints

### 7.1 Transactions

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/transactions/create` | LEARNER | Tạo giao dịch nạp tiền |
| POST | `/transactions/webhook/deposit` | Public | SePay webhook nạp tiền |
| POST | `/transactions/webhook/withdrawal` | Public | SePay webhook rút tiền |
| GET | `/transactions/history` | Auth | Lịch sử giao dịch |
| GET | `/transactions/deposits` | ADMIN | Danh sách nạp tiền |
| GET | `/transactions/all` | ADMIN | Tất cả giao dịch |
| POST | `/transactions/upload-proof` | ADMIN | Upload ảnh chứng minh |

### 7.2 Withdrawals

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/transactions/withdrawals` | LEARNER, TEACHER | Tạo yêu cầu rút tiền |
| POST | `/transactions/withdrawals/verify-otp` | LEARNER, TEACHER | Xác thực OTP |
| POST | `/transactions/withdrawals/:code/resend-otp` | LEARNER, TEACHER | Gửi lại OTP |
| GET | `/transactions/withdrawals/my-withdrawals` | LEARNER, TEACHER | Danh sách rút tiền của tôi |
| GET | `/transactions/withdrawals` | ADMIN1 | Tất cả yêu cầu rút tiền |
| GET | `/transactions/withdrawals/:id` | Auth | Chi tiết rút tiền |
| PUT | `/transactions/withdrawals/:id/approve` | ADMIN1 | Duyệt rút tiền |
| PUT | `/transactions/withdrawals/:id/reject` | ADMIN1 | Từ chối rút tiền |
| PUT | `/transactions/withdrawals/:id/cancel` | LEARNER, TEACHER | Hủy yêu cầu |

### 7.3 Refunds

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/refunds/request` | LEARNER | Yêu cầu hoàn tiền |
| GET | `/refunds/status/:courseId` | LEARNER | Kiểm tra trạng thái hoàn tiền |
| GET | `/refunds/my-refunds` | LEARNER | Danh sách hoàn tiền của tôi |
| GET | `/refunds/all` | ADMIN1 | Tất cả yêu cầu hoàn tiền |
| GET | `/refunds/student/:studentId` | ADMIN1 | Hoàn tiền theo học viên |
| GET | `/refunds/course/:courseId` | ADMIN, TEACHER | Hoàn tiền theo khóa học |
| GET | `/refunds/:refundId` | ADMIN1 | Chi tiết hoàn tiền |
| PUT | `/refunds/:refundId/process` | ADMIN1 | Xử lý hoàn tiền |

### 7.4 Affiliate

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/affiliate/links` | Auth | Tạo link affiliate |
| GET | `/affiliate/links/validate` | Public | Validate link |
| POST | `/affiliate/track-click` | Public | Track click (by link_id) |
| POST | `/affiliate/track-click-by-code` | Public | Track click (by code) |
| GET | `/affiliate/me/summary` | Auth | Tổng quan hoa hồng |
| GET | `/affiliate/me/transactions` | Auth | Lịch sử giao dịch affiliate |
| GET | `/affiliate/admin/statistics` | ADMIN1 | Thống kê tổng quan |
| GET | `/affiliate/admin/transactions` | ADMIN1 | Tất cả giao dịch affiliate |
| PUT | `/affiliate/admin/courses/:id/affiliate` | ADMIN1 | Cấu hình affiliate cho khóa học |

---

## 8. Socket Events

### 8.1 Balance Update

```typescript
// Server emit
this.socketGateway.sendBalanceUpdate(userId, wallet_balance, locked_balance);

// Client listen
socket.on('balance_update', ({ wallet_balance, locked_balance }) => {});
```

### 8.2 Transaction Events

```typescript
// Deposit completed
socket.on('transaction_deposit_completed', { orderCode, amount, status });

// Withdrawal events
socket.on('withdrawalApproved', { withdrawalId, requestCode, amount, status });
socket.on('withdrawalRejected', { withdrawalId, requestCode, amount, reason, status });

// Refund events
socket.on('refundApproved', { refundId, courseId, courseName, amount, status });
socket.on('refundRejected', { refundId, courseId, courseName, reason, status });
```

### 8.3 Admin Events

```typescript
socket.on('new_deposit_notification', { userId, userName, userEmail, amount, orderCode });
socket.on('refundRequest', { refundId, userId, userName, courseId, courseName, amount, reason });
```

---

## 9. Tóm tắt Flow

### 9.1 Nạp tiền
1. Learner tạo request → Backend tạo QR + lưu Redis
2. Learner chuyển khoản → SePay webhook → Backend verify
3. Backend: increment wallet_balance + save transaction + notify

### 9.2 Rút tiền
1. User tạo request → Backend gửi OTP email
2. User verify OTP → Backend trừ wallet_balance + status = PENDING
3. Admin approve → status = COMPLETED
4. Admin reject → refund wallet_balance + status = REJECTED

### 9.3 Hoàn tiền
1. Learner request (trong 30 phút) → Backend tạo refund PENDING
2. Admin approve → cancel enrollment + refund wallet + cancel affiliate + reverse teacher revenue
3. Admin reject → chỉ notify

### 9.4 Affiliate
1. Referrer tạo link → Backend tạo code unique
2. Buyer click link → Backend track click
3. Buyer mua khóa học → Backend tạo affiliate transaction (10% → locked_balance)
4. Sau 30 phút → Scheduler release (locked → wallet)
5. Nếu refund → cancel affiliate + trừ tiền từ locked hoặc wallet
