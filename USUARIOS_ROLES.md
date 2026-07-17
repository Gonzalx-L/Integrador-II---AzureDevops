# DocuColab — Usuarios y Roles

Tenant: `lozano13al000hotmail.onmicrosoft.com`  
Contraseña temporal para todos: `TempPass123!` *(se fuerza cambio al primer login)*

---

## Jerarquía de Roles

| Rol | Descripción | Regiones con acceso |
|---|---|---|
| `AdminGlobal` | Ve y gestiona todas las regiones | PERU, ESPANA, ARGENTINA, NUEVA_ZELANDA |
| `AdminPeru` | Administrador regional | Solo PERU |
| `AdminEspana` | Administrador regional | Solo ESPANA |
| `AdminArgentina` | Administrador regional | Solo ARGENTINA |
| `AdminNuevaZelanda` | Administrador regional | Solo NUEVA_ZELANDA |
| `UploadUser` | Usuario final — solo puede subir archivos ZIP | Sin acceso a Documentos ni Reportes |

---

## Usuarios de Prueba

### Admin Global
| Campo | Valor |
|---|---|
| Usuario | `AdminGlobal@lozano13al000hotmail.onmicrosoft.com` |
| Contraseña | `TempPass123!` |
| Rol | Admin Global |
| Acceso | Todas las regiones + Documentos + Reportes |

---

### Admins Regionales
| Usuario | Contraseña | Rol | Región |
|---|---|---|---|
| `AdminPeru@lozano13al000hotmail.onmicrosoft.com` | `TempPass123!` | Admin Perú | Solo PERU |
| `AdminEspana@lozano13al000hotmail.onmicrosoft.com` | `TempPass123!` | Admin España | Solo ESPANA |
| `AdminArgentina@lozano13al000hotmail.onmicrosoft.com` | `TempPass123!` | Admin Argentina | Solo ARGENTINA |
| `AdminNuevaZelanda@lozano13al000hotmail.onmicrosoft.com` | `TempPass123!` | Admin Nueva Zelanda | Solo NUEVA_ZELANDA |

---

### Usuarios Finales (solo subida de archivos)
| Usuario | Contraseña | Rol | Región de subida |
|---|---|---|---|
| `UploadPeru@lozano13al000hotmail.onmicrosoft.com` | `TempPass123!` | Colaborador | PERU |
| `UploadEspana@lozano13al000hotmail.onmicrosoft.com` | `TempPass123!` | Colaborador | ESPANA |
| `UploadArgentina@lozano13al000hotmail.onmicrosoft.com` | `TempPass123!` | Colaborador | ARGENTINA |
| `UploadNuevaZelanda@lozano13al000hotmail.onmicrosoft.com` | `TempPass123!` | Colaborador | NUEVA_ZELANDA |
| `Antony@lozano13al000hotmail.onmicrosoft.com` | `TempPass123!` | Colaborador | ESPANA |

---

## Permisos por Rol

| Funcionalidad | AdminGlobal | AdminRegional | UploadUser |
|---|:---:|:---:|:---:|
| Ver Dashboard / Inicio | ✅ | ✅ | ❌ |
| Subir archivos ZIP | ✅ | ✅ | ✅ |
| Ver Documentos | ✅ (todas) | ✅ (su región) | ❌ |
| Ver Reportes | ✅ | ✅ | ❌ |
| Selector de países al subir | Todos | Su región | Todos |

---

## Notas

- Los roles se leen del **id_token de Azure AD** (claim `roles`) al iniciar sesión con MSAL.
- El backend filtra los documentos por región via query param `?regions=PERU,ESPANA`.
- Si los roles no aparecen tras el login, verificar en Azure Portal → App Registration → **Token configuration** que el claim `roles` esté habilitado.
