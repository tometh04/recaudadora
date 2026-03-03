# Roadmap 0 → 100 — Sistema de Gestión Integral (Andrés)

> Duraciones estimadas para un equipo 1–2 devs full-time + 1 PM/PO part-time. Ajustable según capacidad.

## PHASE 0 – Research & Validation (2 semanas)

### Tasks

- Workshop AS-IS:
  - flujo real desde ticket WhatsApp → verificación homebanking → registro Excel → saldo/deuda
- Definir TO-BE:
  - estados del comprobante
  - definiciones de "verificado", "aplicado", "ajuste", "rechazado"
- Recolectar dataset real (anonimizado):
  - 200 tickets WhatsApp
  - capturas de pantallas típicas de homebanking (solo para entender campos)
- Definir reglas mínimas:
  - qué campos OCR son obligatorios
  - reglas de asignación cliente por teléfono
- Diseñar wireframes:
  - Inbox
  - detalle de ticket + corrección OCR
  - conciliación (si aplica en MVP)
  - ledger + dashboard

### Deliverables

- Spec de entidades + estados (schema v0)
- Wireframes aprobados
- Dataset de regresión OCR
- Plan MVP (scope cerrado)

### Timeline

- 10 días hábiles

### Success criteria

- MVP cerrado sin ambigüedades
- Dataset suficiente para calibrar OCR y UX de corrección

---

## PHASE 1 – MVP Build (6–8 semanas)

### Architecture decisions (Semana 1)

- Front: Next.js + TS
- Back: FastAPI
- DB: Postgres
- Storage: S3-compatible
- Jobs: Redis + worker
- Observabilidad: logs + health endpoints

### Infra setup (Semana 1)

- Repos + CI/CD
- Envs: dev/staging/prod
- DB managed + backups
- Storage buckets
- Redis managed
- Secrets management

### Exact technical tasks

#### M1 — Auth + RBAC + Auditoría base (Semana 1–2)

- Login + sesiones
- Roles: Superadmin/Admin/Contable/Vendedor
- Audit log: conciliación, ajustes, cambios de monto/cliente/cuenta

#### M2 — Catálogos (Semana 2)

- CRUD clientes B2B
- CRUD cuentas/canales
- Mapa `teléfono → cliente`

#### M3 — WhatsApp ingestion (Semana 2–3)

- Config WhatsApp Business API (proveedor)
- Webhook receiver + validación firma
- Descarga de media + storage
- Idempotencia por message_id
- Crear `inbox_item` con metadata

#### M4 — Inbox UI + acciones rápidas (Semana 3–4)

- Lista con filtros, estados
- Detalle con preview de imagen
- Acciones:
  - asignar cliente/cuenta
  - marcar duplicado
  - pedir mejor foto (plantillas)

#### M5 — OCR pipeline (Semana 3–5)

- Preprocesado de imagen
- OCR extracción monto/fecha
- Confianza por campo
- UI de corrección rápida
- Worker + reintentos + cola

#### M6 — Movimientos para verificación (Semana 5–6)

- Implementar:
  - import CSV/XLSX por cuenta (si existe export)
  - carga asistida (fallback) para registrar movimientos vistos en homebanking
- Normalización a `bank_transactions`

#### M7 — Conciliación asistida mínima (Semana 6–7)

- Sugerencias por monto + ventana temporal
- Confirmación manual
- Estados de excepción mínimos

#### M8 — Ledger + Dashboard básico (Semana 7–8)

- Ledger append-only por cliente
- Depósito verificado → entry
- Dashboard:
  - recibidos/verificados/pendientes
  - pendientes >24h
  - saldos por cliente

### Dev milestones

- End semana 2: login + catálogos
- End semana 3: WhatsApp → Inbox (sin OCR)
- End semana 5: OCR funcionando + corrección rápida
- End semana 6: movimientos (import/carga asistida)
- End semana 7: conciliación mínima
- End semana 8: ledger + dashboard + hardening

### QA checklist (MVP)

- Webhooks:
  - idempotencia OK
  - no pérdida de mensajes
- OCR:
  - 200 tickets: extracción monto/fecha ≥60% con UX de corrección rápida
- Inbox:
  - procesamiento de 50 tickets en <15 min (operador entrenado)
- Seguridad:
  - roles aplicados + auditoría de acciones críticas
- Performance:
  - inbox paginado, filtros rápidos
- Backups:
  - restore probado en staging

### Estimated duration

- 6–8 semanas

### Dependencies

- Disponibilidad de número/proveedor WhatsApp Business API
- Dataset real para OCR

### Critical path

- WhatsApp ingestion → OCR → Inbox UX (si esto falla, no hay ahorro real)

### Main risk

- OCR baja calidad por fotos

### Kill criteria

- Si OCR útil <30% luego de ajustes y preprocesado:
  - mantener OCR como asistente (no bloqueante)
  - reforzar "corrección rápida" y plantillas de pedido de reenvío

---

## PHASE 2 – Beta Launch (3–4 semanas)

### Beta cohort definition

- Interno:
  - Andrés + 4 operativos (uso diario)
- Externo (opcional en beta):
  - 1 mutual piloto (solo notificaciones y/o portal en V1)

### Feedback loop system

- Registro de issues por bucket:
  - OCR (lectura)
  - Inbox UX (fricción)
  - Excepciones (casos raros)
  - Ledger (definición de saldo)
- Ritmo:
  - daily 10 min (operación)
  - weekly con Andrés (KPIs + backlog)

### Iteration cycles

- Semana 1:
  - afinar OCR + corrección rápida + plantillas
- Semana 2:
  - mejorar estados y excepciones + auditoría
- Semana 3:
  - dashboard y reportes mínimos
- Semana 4:
  - hardening + performance + DR

### Estimated duration

- 3–4 semanas

### Dependencies

- Uso real diario
- Alineación de definiciones de saldo/deuda

### Critical path

- Adopción: que la operación se haga en Inbox, no en WhatsApp

### Main risk

- Vuelven al Excel por hábito

### Kill criteria

- Si a 2 semanas:
  - <60% de tickets procesados en el sistema
  - y los pendientes >24h no bajan
  - entonces: rediseño Inbox + acciones rápidas antes de sumar features

---

## PHASE 3 – Monetization Activation (custom project) (1–2 semanas)

### Payment integration

- N/A (precio cerrado por desarrollo)

### Pricing experiments

- N/A

### Conversion funnel

- N/A

### Tasks

- UAT (User Acceptance Testing) con checklist firmado por Andrés:
  - ingreso WhatsApp automático
  - OCR + correcciones
  - dashboard y ledger consistentes
- Documentación operativa:
  - 1 página por módulo
- Runbook técnico:
  - backups, restore, monitoreo, rotación de secretos
- Handoff:
  - soporte de estabilización post go-live

### Estimated duration

- 1–2 semanas

### Dependencies

- Beta estable

### Critical path

- UAT + documentación

### Main risk

- Scope creep al cierre

### Kill criteria

- No firmar UAT si:
  - ledger inconsistente
  - auditoría incompleta en acciones críticas

---

## PHASE 4 – Scale (V1/V2) (6–10 semanas)

### Hiring plan (si aplica)

- 1 dev full-stack para evolución + soporte
- QA operativo (puede ser interno)

### System hardening

- Performance con históricos:
  - 50k–200k tickets (diseño escalable)
- Seguridad:
  - 2FA opcional para Superadmin
  - políticas de contraseñas
  - hardening de webhooks
- Observabilidad:
  - métricas OCR (tasa de éxito)
  - métricas de procesamiento (pendientes, SLA)

### Growth loops (dentro del cliente)

- Portal B2B (V1):
  - migración gradual de mutuales a carga por portal/magic link
- Reducir WhatsApp a:
  - solo ingesta automática + notificaciones
  - sin operación manual

### Automation

- Centro de excepciones completo:
  - duplicados probables
  - movimientos sin ticket
  - tickets sin movimiento
- Alertas:
  - pendientes >24h
  - picos anómalos por cliente/canal
- AI Agent (V2):
  - consultas SQL-safe
  - preguntas frecuentes como botones

### Estimated duration

- 6–10 semanas

### Dependencies

- MVP estable + adopción real
- Definición final de reglas de comisión (si se automatizan)

### Critical path

- Portal B2B + excepciones avanzadas + hardening

### Main risk

- Cada nuevo canal/formato requiere soporte ad-hoc

### Kill criteria

- Si onboarding de nuevos formatos toma >2 días dev por caso:
  - estandarizar plantillas
  - limitar formatos soportados
  - priorizar carga asistida
