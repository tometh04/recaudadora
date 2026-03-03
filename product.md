# PRD — Sistema de Gestión Integral para Recaudadora (Andrés)

## 1. Executive Summary

### Problem

- Operación diaria depende de:
  - WhatsApp como "bandeja de entrada" de comprobantes (fotos).
  - Doble check manual en homebanking (Macro/Credicoop/otros).
  - Excel como libro de control (depósitos, comisiones, entregas, saldo/deuda).
- Impacto:
  - 2–3 horas diarias de trabajo manual solo para ordenar y verificar comprobantes.
  - Riesgo alto de errores:
    - comprobantes perdidos o duplicados
    - tickets sin verificación
    - movimientos sin ticket
    - saldos/deuda inconsistentes
  - Falta de "big picture":
    - rentabilidad real por período/cliente/canal
    - exposición por canal/cuenta
    - deuda por mutual/cliente con trazabilidad

### Current alternatives

- Excel + WhatsApp + homebanking manual.
- ERP/contables genéricos:
  - no resuelven ingesta de tickets por WhatsApp + OCR + conciliación operacional
  - no modelan cuenta corriente operativa + multi-cuenta/canal
- CRMs:
  - no resuelven tesorería/conciliación/ledger

### Why now

- Creció la complejidad por:
  - múltiples cuentas/canales (bancos/billeteras/proveedor-saldo virtual)
  - incremento de tickets/operaciones
- El costo operativo (tiempo + errores) ya es relevante y escalable.
- El Excel dejó de ser confiable como sistema de verdad.

### Unique angle

- Sistema "operación-first" para recaudación/cobranza:
  - *WhatsApp → Inbox automático* (sin depender de chats)
  - *OCR desde día 1* para extraer datos del comprobante
  - *Conciliación asistida* (sin integraciones bancarias; con import/carga asistida)
  - *Cuenta corriente (ledger) auditable* por mutual/cliente
  - *Tablero ejecutivo* para big picture: rentabilidad, saldos, deuda, excepciones

---

## 2. Target User Persona

### Persona A — Andrés (Dueño / Superadministrador)

- Demographics
  - Dueño, decisión final única.
  - Rosario, opera toda la provincia.
- Behavior
  - Control diario de ingresos/entregas y saldos.
  - Toma decisiones con Excel + verificación manual.
- Pain points
  - No tiene visibilidad consolidada y confiable.
  - Pierde tiempo en WhatsApp y verificaciones manuales.
  - No puede auditar "quién tocó qué" internamente.
- Buying triggers
  - "Quiero ver todo el negocio en un solo lugar con números reales."
  - "Quiero reducir el tiempo operativo diario sin complicar el flujo."
- Objections
  - "No quiero depender de integraciones bancarias."
  - "No quiero que el sistema sea más trabajo que WhatsApp."

### Persona B — Operativos (Tesorería / Backoffice)

- Demographics
  - 4 usuarios: Admin / Contable / Vendedor / Operativo.
- Behavior
  - Gestionan tickets, verificaciones, registros y saldos.
- Pain points
  - Alto volumen de tareas repetitivas.
  - Falta de un flujo estándar (excepciones constantes).
- Buying triggers
  - Bandeja única, estados claros, acciones rápidas.
- Objections
  - "Si el OCR falla o es lento, perdemos tiempo."

### Persona C — Cliente B2B (Mutual / Empresa) — Secundario

- Demographics
  - Mutual/empresa que envía comprobantes.
- Behavior
  - Envía ticket, quiere confirmación/estado.
- Pain points
  - No hay trazabilidad: "¿lo viste? ¿impactó?"
- Buying triggers
  - Portal simple + notificaciones.
- Objections
  - "No quiero crear usuarios/contraseñas complejas."

---

## 3. Core Value Proposition

### Primary promise

- "Todos los comprobantes entran automáticamente al sistema (sin chats), se leen con OCR y quedan listos para verificar. Andrés ve saldos, deuda y rentabilidad en tiempo real."

### Secondary benefits

- Reducción de 2–3h/día de gestión de WhatsApp → bandeja ordenada con acciones 1-click.
- Menos errores por duplicados/faltantes, mejor seguimiento de pendientes.
- Auditoría completa y trazabilidad.
- Menos fricción con mutuales/empresas: estados y confirmaciones.

### Differentiation

- Enfoque operativo real:
  - WhatsApp ingestion + OCR + estados + excepciones
  - ledger auditable (no editable) para cuenta corriente
  - conciliación asistida sin integraciones bancarias

---

## 4. Market Analysis (contextual, aunque sea producto custom)

### TAM / SAM / SOM estimation logic

- TAM:
  - empresas de recaudación/cobranza/intermediación de depósitos y pagos en efectivo con backoffice manual
- SAM:
  - actores regionales/provinciales en Argentina sin core bancario, operando con Excel/WhatsApp
- SOM:
  - Rosario + provincia (redes similares y mutuales)

### Competitor mapping

- Alternativa base:
  - Excel + WhatsApp + homebanking
- Sistemas contables/ERP:
  - cubren contabilidad pero no la operación específica de tickets/conciliación
- Soluciones custom internas:
  - generalmente sin OCR ni flujos de excepciones robustos

### Competitive advantages

- Time-to-value rápido (MVP útil en semanas).
- Minimiza dependencia de integraciones bancarias.
- Reduce tarea manual sin romper operación actual.

### Barriers to entry

- Modelado correcto del ledger y auditoría.
- OCR + normalización consistente.
- Diseño de flujo de excepciones que realmente reduce tiempo.

---

## 5. Product Scope

### MVP (estricto y realista)

*Objetivo MVP:* eliminar WhatsApp como "bandeja" y reemplazar Excel como sistema de verdad para depósitos/tickets + big picture básica.

Incluye:

- Web app interna (Andrés + 4 operativos) con RBAC.
- *WhatsApp → Inbox automático* (Business API) para ingresar comprobantes (fotos).
- Upload manual fallback (si llega por otros medios).
- OCR desde día 1:
  - extrae monto/fecha (y campos adicionales si es posible)
  - confianza por campo + corrección rápida
- Estados y flujo:
  - Recibido → OCR listo → Pendiente de verificación → Verificado/Rechazado → Aplicado a cuenta corriente
- Catálogos:
  - Clientes B2B (mutuales/empresas)
  - Cuentas/canales (Macro, Credicoop, billetera, proveedor-saldo virtual)
  - Mapa teléfono WhatsApp → cliente B2B
- Verificación sin integración bancaria:
  - *Modo A:* import CSV/Excel (si homebanking permite)
  - *Modo B:* carga asistida de movimientos (pegar filas / registro rápido)
  - (PDF parsing opcional si hay descarga, pero no requerido en MVP)
- Cuenta corriente (ledger) por cliente B2B:
  - crédito: depósitos verificados
  - débito: entregas/pagos/comisiones/ajustes (en MVP: manual simple)
- Dashboard ejecutivo básico:
  - depósitos recibidos/verificados/pendientes
  - saldos por cliente
  - excepciones principales
- Notificaciones:
  - WhatsApp solo para "recibido / falta info / verificado" (plantillas)

### V1 features

- Portal B2B (mutuales/empresas) para subir comprobantes y ver estados:
  - login por invitación o magic link
- Reglas de comisión configurables por cliente/canal (versionadas).
- Centro de Excepciones completo:
  - ticket sin movimiento, movimiento sin ticket, duplicados, OCR bajo
- Reportes:
  - rentabilidad por cliente/canal/período (margen por comisiones vs costos configurables)
  - aging de saldos/deuda
- Auditoría avanzada:
  - export de logs y cambios críticos

### V2 features

- AI Agent (Cerebro) sobre datos internos (SQL-safe):
  - consultas rápidas tipo "¿cuánto entró hoy por Macro?" / "pendientes >24h"
- Caja/entregas (si el cliente lo prioriza):
  - órdenes internas, responsables, comprobantes de entrega
- Integraciones opcionales:
  - proveedor (saldo virtual) vía import/reporte
  - bancarias si se vuelven viables

### Out of scope

- App móvil nativa.
- Dependencia operativa de WhatsApp (solo ingesta/notificación).
- Automatización de acciones financieras sensibles sin confirmación humana.
- Integraciones bancarias directas en MVP.

---

## 6. Feature Breakdown

### F1 — Autenticación + Roles (RBAC) + Auditoría base

- Description
  - Roles: Superadmin (Andrés), Admin, Contable, Vendedor/Operativo.
  - Auditoría de acciones críticas.
- User story
  - "Como Andrés, quiero saber quién concilió/ajustó algo y limitar permisos."
- Acceptance criteria
  - Login + sesiones seguras.
  - Permisos aplicados a UI y API.
  - Audit log: usuario, acción, entidad, timestamp, before/after.
- Technical considerations
  - JWT + refresh.
  - Tabla `audit_events` append-only.
  - Middleware RBAC.

### F2 — Clientes B2B + Mapeo de teléfonos WhatsApp

- Description
  - CRUD de mutuales/empresas.
  - Asignación de números autorizados.
- User story
  - "Como operador, quiero que al entrar un ticket desde WhatsApp se asigne al cliente correcto."
- Acceptance criteria
  - Alta cliente + múltiples teléfonos.
  - Si teléfono desconocido → estado "sin identificar".
- Technical considerations
  - Tabla `client_phones` con whitelist.
  - Rate limiting/validación de mensajes entrantes.

### F3 — Cuentas/Canales

- Description
  - Registrar cuentas (Macro, Credicoop, billetera, proveedor).
- User story
  - "Como tesorería, quiero ver por dónde entra cada operación."
- Acceptance criteria
  - Tipos: banco / billetera / proveedor-saldo virtual.
  - Campos mínimos: nombre interno, tipo, notas.
- Technical considerations
  - Pipeline de movimientos asociado por cuenta (import/carga asistida).

### F4 — WhatsApp Ingestion (MVP core)

- Description
  - Ingesta automática de mensajes con media (fotos) a Inbox.
- User story
  - "Como Andrés, quiero que no se pierda ningún comprobante y verlo ordenado en el sistema."
- Acceptance criteria
  - Webhook recibe eventos.
  - Descarga media y la almacena.
  - Crea `inbox_item` con metadata (teléfono, timestamp, message_id).
  - Idempotencia (no duplica si llega el mismo mensaje).
- Technical considerations
  - WhatsApp Business API + webhooks.
  - Worker para descargar media (reintentos, backoff).
  - Storage S3-compatible.

### F5 — Inbox de Comprobantes + Estados + Acciones rápidas

- Description
  - Bandeja única para ver todos los comprobantes.
- User story
  - "Como operador, quiero procesar 50 tickets seguidos sin abrir WhatsApp."
- Acceptance criteria
  - Lista con filtros: cliente, estado, cuenta, fecha.
  - Acciones: asignar cliente/cuenta, corregir OCR, marcar duplicado, pedir mejor foto.
- Technical considerations
  - Diseño UX "1-click" y shortcuts.
  - Optimización para volumen (paginación, índices).

### F6 — OCR de tickets (día 1)

- Description
  - Extraer monto/fecha y otros campos si posible.
- User story
  - "Quiero evitar tipear datos repetitivos."
- Acceptance criteria
  - Procesa en <30s por ticket.
  - Guarda confianza por campo.
  - Permite corrección rápida.
- Technical considerations
  - OCR pipeline con preprocesado (rotación, contraste).
  - Guardar `ocr_results` + versión del modelo.
  - Cola de trabajos (Redis/worker).

### F7 — Movimientos para verificación (sin integración bancaria)

- Description
  - Llevar al sistema un "registro de movimientos" para confirmar "impactó/no impactó".
- User story
  - "Quiero validar tickets rápido contra lo que veo en homebanking."
- Acceptance criteria
  - Modo A: import de CSV/Excel por cuenta.
  - Modo B: carga asistida rápida (copiar/pegar filas o formulario ágil).
  - Normaliza: fecha, monto, referencia, crédito/débito.
- Technical considerations
  - Parser CSV/XLSX con mapeo de columnas.
  - Idempotencia por import.
  - UI de carga asistida con validaciones.

### F8 — Conciliación asistida (matching) + Excepciones (MVP mínimo)

- Description
  - Sugerir match ticket ↔ movimiento.
- User story
  - "Quiero confirmar rápido sin buscar manualmente."
- Acceptance criteria
  - Sugerencias por monto y ventana temporal.
  - Confirmación manual obligatoria.
  - Estados de excepción básicos:
    - ticket sin movimiento
    - movimiento sin ticket
- Technical considerations
  - Algoritmo scoring determinístico.
  - Locks para evitar doble conciliación.
  - Tabla `reconciliations`.

### F9 — Cuenta corriente (Ledger) por Cliente B2B

- Description
  - Libro mayor por mutual/empresa.
- User story
  - "Quiero saber cuánto le debo/ me deben con historial."
- Acceptance criteria
  - Ledger append-only.
  - Depósito verificado crea entry automáticamente.
  - Ajustes requieren rol elevado + motivo.
- Technical considerations
  - No permitir UPDATE/DELETE de entries (solo reversa).
  - Cálculo de saldo por agregación/index.

### F10 — Dashboard Ejecutivo (Big picture)

- Description
  - Vista para Andrés con KPIs y alertas.
- User story
  - "Quiero entender el negocio en 5 minutos."
- Acceptance criteria
  - KPIs:
    - tickets recibidos/verificados/pendientes
    - pendientes >24h
    - saldos por cliente
    - top excepciones
  - Filtros por período/cuenta/cliente.
- Technical considerations
  - Queries agregadas + vistas materializadas opcionales.

### F11 — Portal B2B (V1)

- Description
  - Subida directa de comprobantes + estados.
- User story
  - "Como mutual, quiero subir y ver si fue verificado."
- Acceptance criteria
  - Alta por invitación o magic link.
  - Historial y estado.
- Technical considerations
  - Aislamiento por cliente (multi-tenant lógico).
  - Rate limiting + captcha.

### F12 — AI Agent (V2 o V1+)

- Description
  - Chat interno para consultas sobre datos del sistema.
- User story
  - "Quiero preguntar '¿cuánto entró hoy?' sin armar reportes."
- Acceptance criteria
  - Respuestas basadas en consultas SQL seguras (solo lectura).
  - Si faltan datos (ej. no hay movimientos cargados), responde explícitamente.
- Technical considerations
  - Text-to-SQL con allowlist, límites, logging.
  - No acciones irreversibles desde el agente.

---

## 7. Technical Architecture

### Frontend

- Next.js (React) + TypeScript
- UI:
  - Inbox (comprobantes)
  - Conciliación
  - Clientes
  - Cuentas/canales
  - Cuenta corriente
  - Dashboard
  - Auditoría
- Componentes clave:
  - visor de imagen + OCR overlay
  - panel de acciones rápidas
  - filtros y búsqueda

### Backend

- FastAPI (recomendado por OCR/ETL) o NestJS (si preferís estructura enterprise).
- Servicios/módulos:
  - auth/rbac
  - whatsapp_webhooks
  - documents + storage
  - ocr_jobs
  - statements (import/carga asistida)
  - reconciliation
  - ledger
  - reporting/dashboard
  - audit

### Database

- PostgreSQL
- Tablas mínimas:
  - users, roles, permissions
  - b2b_clients, client_phones
  - accounts
  - inbox_items, documents, ocr_results
  - statements_imports, bank_transactions
  - reconciliations
  - ledger_entries
  - audit_events
- Índices:
  - inbox_items(status, received_at)
  - bank_transactions(account_id, date, amount)
  - ledger_entries(client_id, created_at)

### APIs

- REST JSON
- Endpoints base:
  - /auth/*
  - /clients/*
  - /accounts/*
  - /inbox/*
  - /documents/*
  - /ocr/*
  - /transactions/import
  - /transactions/manual
  - /reconciliation/suggest
  - /reconciliation/confirm
  - /ledger/*
  - /dashboard/*
  - /audit/*

### AI usage

- OCR obligatorio desde día 1:
  - pipeline + calidad de imagen + confianza por campo
- AI Agent:
  - text-to-SQL con guardrails (solo lectura)

### Hosting

- Cloud:
  - Frontend: Vercel
  - Backend: Render/Fly/Railway
  - DB: managed Postgres
  - Storage: S3-compatible
  - Cola: Redis managed

### Security

- RBAC estricto
- HTTPS
- Logs y auditoría inmutables
- Rate limiting en webhooks y portal B2B
- Backups automáticos DB + storage

### Scalability considerations

- Jobs async para OCR y descarga de media
- Idempotencia en webhooks e imports
- Paginación y consultas indexadas
- Separación worker/backend

---

## 8. Required Skills

### Technical skills

- Full-stack web (Next.js/React)
- Backend API (FastAPI/Nest)
- PostgreSQL + modelado ledger/auditoría
- OCR + preprocesado de imágenes
- ETL (CSV/XLSX) + idempotencia
- Seguridad (RBAC, logs, rate limiting)

### Product skills

- Mapeo AS-IS/TO-BE
- Diseño de estados/excepciones
- Priorización MVP vs V1/V2
- UX backoffice

### Growth skills (mínimo, producto custom)

- Onboarding + capacitación
- Documentación operativa

### Ops skills

- QA con dataset real (regresión OCR/matching)
- Monitoreo + alertas
- Backups/DR

---

## 9. Monetization Strategy (proyecto custom)

- Pricing model
  - Precio cerrado por desarrollo (MVP + V1 pactados).
- Cost structure (para estimación de esfuerzo)
  - Infra (hosting + DB + storage + Redis)
  - WhatsApp Business API (proveedor/fees)
  - OCR (costo compute o servicio)
  - Soporte y cambios (fuera del alcance del precio cerrado)
- Unit economics logic (para el ROI del cliente)
  - Ahorro de tiempo diario (2–3h → procesamiento por bandeja)
  - Reducción de errores (menos ajustes/discusiones)
  - Mejor control (pricing/mix por rentabilidad)

---

## 10. Metrics & KPIs

### Acquisition (interno / adopción)

- % de comprobantes que ingresan por sistema vs fuera (debería tender a 100%).
- % de clientes B2B migrados a portal (V1).

### Activation

- Tiempo hasta primer comprobante procesado por cliente B2B.
- % de tickets con OCR completo sin corrección manual.

### Retention

- Usuarios internos activos diarios.
- % de operación resuelta en el sistema (sin Excel).

### Revenue (negocio de Andrés)

- Comisión total por período.
- Rentabilidad por cliente/canal (V1).
- Concentración por cliente (riesgo).

### North Star Metric

- *% de comprobantes procesados (OCR + estado) en <24h sin uso de WhatsApp como bandeja*.

---

## 11. Risks

### Technical risks

- OCR falla por fotos malas
- Webhooks duplicados/caídos
- Import/carga de movimientos inconsistente

Mitigation

- Detección de blur y pedido de reenvío
- Idempotencia en webhooks (message_id)
- Modo "carga asistida" robusto como fallback

### Market/adoption risks

- Operativos vuelven a Excel/WhatsApp por hábito

Mitigation

- Inbox como única fuente de trabajo
- Reportes solo desde el sistema
- Cierre diario con checklist

### Regulatory risks

- Operación sensible: necesidad de trazabilidad y auditoría

Mitigation

- Ledger append-only
- Auditoría completa
- Roles y permisos estrictos

### Execution risks

- Scope creep (querer integrar todo desde el día 1)

Mitigation

- MVP cerrado
- Control de cambios
- V1/V2 planificados

---

## 12. Go-To-Market Strategy (implementación en cliente)

### Early traction strategy

- Semana 1: WhatsApp ingestion + Inbox en paralelo con Excel
- Semana 2: sistema como "verdad" para tickets; Excel solo backup
- Semana 3–4: conciliación asistida + dashboard para Andrés
- V1: portal B2B piloto con 1 mutual + 1 empresa

### Channels

- Capacitación interna
- Onboarding por mutual/empresa (si portal)

### Messaging

- Interno:
  - "No se trabaja más desde chats; se trabaja desde Inbox."
- B2B:
  - "Enviá el comprobante y seguí el estado."

### Validation steps

- Medir:
  - tiempo diario de procesamiento
  - pendientes >24h
  - errores/duplicados

---

## 13. Validation Plan

### Hypothesis

- H1: WhatsApp→Inbox reduce >60% el tiempo de gestión de tickets.
- H2: OCR reduce >50% carga manual de datos.
- H3: Dashboard + ledger elimina incertidumbre de deuda/saldos.

### Experiments

- Semana 1: comparar tiempo "día con WhatsApp" vs "día con Inbox"
- Dataset OCR: 200 tickets reales con medición de confianza

### MVP test

- 200 comprobantes:
  - ≥60% OCR usable (monto/fecha) con corrección rápida
  - 0 tickets perdidos (trazabilidad completa)
  - reducción medible de tiempo operativo

### Feedback loops

- Daily 10 min con operativos (1–2 semanas)
- Weekly 30 min con Andrés (KPIs + backlog)
