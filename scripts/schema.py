"""Generate the auditable Prisma model skeleton; committed schema is authoritative."""
from pathlib import Path
models = {}
def model(name, fields, relations=None, extra=''):
    models[name] = [fields, relations or {}, extra]
model('Organization', 'name String\nslug String @unique', extra='@@map("organizations")')
model('BusinessUnit', 'name String\ncode String', extra='@@unique([organizationId, code])')
model('Role', 'name String\nscope String @default("ASSIGNED")', extra='@@unique([organizationId, name])')
model('Permission', 'key String @unique\ndescription String')
model('RolePermission', '', {'role':('Role',False), 'permission':('Permission',False)}, '@@unique([roleId, permissionId])')
model('User', 'email String @unique\nname String\npasswordHash String\nstatus String @default("ACTIVE")', {'role':('Role',False), 'businessUnit':('BusinessUnit',True)})
model('Session', 'tokenHash String @unique\nexpiresAt DateTime\nlastSeenAt DateTime @default(now())', {'user':('User',False)})
model('Department', 'name String', {'businessUnit':('BusinessUnit',True)})
model('Employee', 'employeeCode String\nname String\nphone String?\nemail String?\nposition String @default("WORKER")\njoiningDate DateTime @default(now())\nstatus String @default("ACTIVE")', {'businessUnit':('BusinessUnit',False), 'user':('User',True), 'department':('Department',True), 'supervisor':('Employee',True), 'manager':('Employee',True)}, '@@unique([organizationId, employeeCode])\n@@unique([userId, organizationId])')
model('Client', 'name String\ncompany String\ncontactPerson String?\nphone String?\nemail String?\naddress String?\ngstNumber String?\nstatus String @default("ACTIVE")', {'businessUnit':('BusinessUnit',False), 'manager':('Employee',True)})
model('Contact', 'name String\nphone String?\nemail String?\nposition String?', {'client':('Client',False)})
model('Lead', 'name String\ncompany String\nsource String\ncontact String?\nrequirement String?\nstatus String @default("NEW")\nnotes String?', {'businessUnit':('BusinessUnit',False), 'salesperson':('Employee',True)})
model('FollowUp', 'scheduledAt DateTime\nnotes String\ncompletedAt DateTime?', {'lead':('Lead',False)})
model('Contract', 'name String\ncontractNumber String\nstartDate DateTime\nendDate DateTime\nvalue Decimal @db.Decimal(14,2)\nservices String\nrenewalStatus String @default("ACTIVE")', {'businessUnit':('BusinessUnit',False), 'client':('Client',False)}, '@@unique([organizationId, contractNumber])')
model('Site', 'name String\naddress String\nlatitude Float?\nlongitude Float?\nwasteType String @default("MIXED")\nexpectedDailyWaste Decimal @default(0) @db.Decimal(12,3)\nstartDate DateTime @default(now())\nstatus String @default("ACTIVE")', {'businessUnit':('BusinessUnit',False), 'client':('Client',False), 'contract':('Contract',True), 'manager':('Employee',True), 'supervisor':('Employee',True)})
model('Shift', 'name String\nstartMinute Int\nendMinute Int\ngraceMinutes Int @default(15)\ntimezone String @default("Asia/Kolkata")', {'businessUnit':('BusinessUnit',False)})
model('SiteAssignment', 'startDate DateTime\nendDate DateTime?\nisPrimary Boolean @default(false)', {'businessUnit':('BusinessUnit',False), 'site':('Site',False), 'employee':('Employee',False), 'supervisor':('Employee',True), 'shift':('Shift',False)})
model('NfcCard', 'name String\ncardHash String @unique\nstatus String @default("ACTIVE")', {'employee':('Employee',False)})
model('AttendanceDevice', 'name String\nkeyHash String @unique\nstatus String @default("ACTIVE")', {'businessUnit':('BusinessUnit',False), 'site':('Site',False)})
model('Attendance', 'workDate DateTime @db.Date\ncheckIn DateTime\ncheckOut DateTime?\nstatus String @default("PRESENT")\nsource String @default("MANUAL")\nlatitude Float?\nlongitude Float?\novertimeMinutes Int @default(0)\nearlyDeparture Boolean @default(false)\ncorrectionReason String?', {'businessUnit':('BusinessUnit',False), 'employee':('Employee',False), 'site':('Site',False), 'shift':('Shift',False), 'device':('AttendanceDevice',True)}, '@@unique([employeeId, siteId, workDate])')
model('AttendanceTap', 'eventKey String @unique\ntimestamp DateTime\naction String', {'employee':('Employee',False), 'device':('AttendanceDevice',False)})
model('WasteCategory', 'name String', extra='@@unique([organizationId, name])')
model('WasteRecord', 'name String\nrecordedAt DateTime @default(now())\nquantity Decimal @db.Decimal(12,3)\nunit String @default("KG")\nstage String @default("COLLECTED")\nnotes String?', {'businessUnit':('BusinessUnit',False), 'site':('Site',False), 'worker':('Employee',False), 'category':('WasteCategory',False)})
model('Vendor', 'name String\ntype String\ncontactPerson String?\nphone String?\nemail String?\nservices String?\nrate Decimal? @db.Decimal(12,2)\nstatus String @default("ACTIVE")', {'businessUnit':('BusinessUnit',False)})
model('Vehicle', 'name String\nregistration String\ncapacity Decimal? @db.Decimal(12,3)', {'businessUnit':('BusinessUnit',False), 'vendor':('Vendor',True)}, '@@unique([organizationId, registration])')
model('Disposal', 'name String\ndisposedAt DateTime @default(now())\nquantity Decimal @db.Decimal(12,3)\nmethod String\nreceiptNumber String?\nnotes String?', {'businessUnit':('BusinessUnit',False), 'site':('Site',False), 'wasteRecord':('WasteRecord',False), 'vendor':('Vendor',False), 'vehicle':('Vehicle',True)})
model('Task', 'name String\ndescription String?\nstatus String @default("PENDING")\npriority String @default("MEDIUM")\ndueAt DateTime', {'businessUnit':('BusinessUnit',False), 'site':('Site',False), 'assignee':('Employee',False)})
model('Ticket', 'name String\ncategory String\npriority String @default("MEDIUM")\ndescription String\nstatus String @default("OPEN")\ndueAt DateTime\nresolvedAt DateTime?', {'businessUnit':('BusinessUnit',False), 'site':('Site',False), 'client':('Client',False), 'assignee':('Employee',True)})
model('SiteVisit', 'name String\nvisitedAt DateTime @default(now())\nlatitude Float\nlongitude Float\nchecklist Json\nnotes String?\nactionItems String?', {'businessUnit':('BusinessUnit',False), 'site':('Site',False), 'manager':('Employee',False)})
model('Machine', 'name String\nmachineCode String\nmodel String\ninstallationDate DateTime\nstatus String @default("IDLE")\ncapacity Decimal @db.Decimal(12,3)\noperatingHours Decimal @default(0) @db.Decimal(12,2)\nmaintenanceDue DateTime?', {'businessUnit':('BusinessUnit',False), 'site':('Site',False)}, '@@unique([organizationId, machineCode])')
model('MachineEvent', 'name String\nkind String\nstate String?\nrecordedAt DateTime @default(now())\npayload Json?', {'businessUnit':('BusinessUnit',False), 'site':('Site',False), 'machine':('Machine',False)})
model('ProductionBatch', 'name String\nbatchCode String\ninputKg Decimal @db.Decimal(12,3)\noutputKg Decimal? @db.Decimal(12,3)\nstartTime DateTime\nendTime DateTime?\nqualityStatus String @default("PENDING")', {'businessUnit':('BusinessUnit',False), 'site':('Site',False), 'machine':('Machine',False), 'operator':('Employee',False)}, '@@unique([organizationId, batchCode])')
model('MaintenanceRecord', 'name String\ntype String\nstatus String @default("SCHEDULED")\nscheduledAt DateTime\ncompletedAt DateTime?\ncost Decimal @default(0) @db.Decimal(12,2)\ndowntimeMinutes Int @default(0)\nnotes String?', {'businessUnit':('BusinessUnit',False), 'site':('Site',False), 'machine':('Machine',False), 'technician':('Employee',True)})
model('SparePart', 'name String\npartCode String\nquantity Int\nunitCost Decimal @db.Decimal(12,2)', {'maintenance':('MaintenanceRecord',False)})
model('Invoice', 'name String\ninvoiceNumber String\nissuedAt DateTime\ndueAt DateTime\namount Decimal @db.Decimal(14,2)\nstatus String @default("ISSUED")', {'businessUnit':('BusinessUnit',False), 'site':('Site',False), 'client':('Client',False), 'contract':('Contract',True)}, '@@unique([organizationId, invoiceNumber])')
model('Payment', 'name String\namount Decimal @db.Decimal(14,2)\npaidAt DateTime\nreference String\nmethod String', {'businessUnit':('BusinessUnit',False), 'site':('Site',False), 'invoice':('Invoice',False)}, '@@unique([organizationId, reference])')
model('Expense', 'name String\ncategory String\namount Decimal @db.Decimal(14,2)\nincurredAt DateTime\nstatus String @default("PENDING")', {'businessUnit':('BusinessUnit',False), 'site':('Site',False), 'vendor':('Vendor',True)})
model('Document', 'name String\nobjectKey String @unique\nmimeType String\nsize Int\ndocumentType String\nexpiresAt DateTime?', {'businessUnit':('BusinessUnit',False), 'site':('Site',True), 'employee':('Employee',True), 'client':('Client',True), 'contract':('Contract',True), 'vendor':('Vendor',True), 'machine':('Machine',True)})
model('Notification', 'name String\nmessage String\nkind String\ndedupeKey String @unique\nreadAt DateTime?\nchannel String @default("IN_APP")\ndeliveredAt DateTime?', {'businessUnit':('BusinessUnit',True), 'site':('Site',True), 'user':('User',False)})
model('AuditLog', 'action String\nentity String\nentityId String\npreviousValue Json?\nnewValue Json?\nrequestId String?', {'businessUnit':('BusinessUnit',True), 'site':('Site',True), 'actor':('User',True)})
inverse = {n:[] for n in models}
for name, (_, rels, _) in models.items():
    if name not in ['Organization','Permission']:
        inverse['Organization'].append(f'{name[0].lower()+name[1:]}Records {name}[]')
    for field,(target,optional) in rels.items():
        relation = name+'_'+field
        inverse[target].append(f'{name[0].lower()+name[1:]}_{field} {name}[] @relation("{relation}")')
lines=['generator client {\n  provider = "prisma-client-js"\n}\n','datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")\n}\n']
import re
for name,(fields,rels,extra) in models.items():
    base=['id String @id @default(uuid()) @db.Uuid','createdAt DateTime @default(now()) @map("created_at")','updatedAt DateTime @updatedAt @map("updated_at")','createdBy String? @db.Uuid @map("created_by")','updatedBy String? @db.Uuid @map("updated_by")','deletedAt DateTime? @map("deleted_at")']
    if name not in ['Organization','Permission']:
        base += ['organizationId String @db.Uuid @map("organization_id")','organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)']
    base += fields.splitlines()
    for field,(target,optional) in rels.items():
        opt='?' if optional else ''
        base += [f'{field}Id String{opt} @db.Uuid', f'{field} {target}{opt} @relation("{name}_{field}", fields: [{field}Id'+ (', organizationId' if target != 'Permission' else '')+f'], references: [id'+(', organizationId' if target != 'Permission' else '')+'], onDelete: Restrict)']
    base += inverse[name]
    if name not in ['Organization','Permission']:
        base += ['@@unique([id, organizationId])','@@index([organizationId, deletedAt])']
        if 'businessUnit' in rels: base += ['@@index([organizationId, businessUnitId])']
        if 'site' in rels: base += ['@@index([organizationId, siteId])']
    if extra: base += extra.splitlines()
    if '@@map' not in extra:
        table=re.sub(r'(?<!^)(?=[A-Z])','_',name).lower()
        base += [f'@@map("{table}s")']
    lines.append('model '+name+' {\n  '+'\n  '.join(base)+'\n}\n')
Path('packages/database/prisma').mkdir(parents=True,exist_ok=True)
Path('packages/database/prisma/schema.prisma').write_text('\n'.join(lines))
