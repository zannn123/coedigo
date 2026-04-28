# System Architecture Overview

High-level architecture of the COEDIGO system.

---

## 🏗️ Architecture Pattern

**Type:** Three-Tier Architecture (Presentation, Business Logic, Data)

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         React SPA (Frontend)                     │  │
│  │  - React 18 + Vite                              │  │
│  │  - React Router (Navigation)                    │  │
│  │  - Context API (State Management)               │  │
│  │  - Axios (HTTP Client)                          │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           │ HTTP/REST
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   BUSINESS LOGIC LAYER                   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         PHP REST API (Backend)                   │  │
│  │  - Controllers (Endpoints)                       │  │
│  │  - Middleware (Auth, Validation)                 │  │
│  │  - Utils (Helpers, Response)                     │  │
│  │  - Business Logic                                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           │ PDO
                           ▼
┌─────────────────────────────────────────────────────────┐
│                       DATA LAYER                         │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         MySQL Database                           │  │
│  │  - Users & Authentication                        │  │
│  │  - Classes & Enrollments                        │  │
│  │  - Grades & Components                          │  │
│  │  - Attendance Records                           │  │
│  │  - Audit Logs                                   │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Design Principles

### 1. Separation of Concerns
- **Frontend:** UI/UX only, no business logic
- **Backend:** Business rules, validation, computation
- **Database:** Data persistence and integrity

### 2. RESTful API Design
- Stateless communication
- Resource-based URLs
- Standard HTTP methods (GET, POST, PUT, DELETE)
- JSON data format

### 3. Role-Based Access Control (RBAC)
- Admin: Full system access
- Faculty: Class and grade management
- Student: Read-only access to own data
- Dean/Program Chair: Oversight and reports

### 4. Security First
- Password hashing (bcrypt)
- SQL injection prevention (PDO prepared statements)
- XSS protection
- CORS configuration
- Session-based authentication

---

## 📦 Component Architecture

### Frontend Components

```
frontend/src/
├── components/          # Reusable UI components
│   ├── Navbar.jsx      # Navigation bar
│   ├── Sidebar.jsx     # Side navigation
│   └── Toast.jsx       # Notifications
├── contexts/           # React contexts
│   ├── AuthContext.jsx # Authentication state
│   └── ThemeContext.jsx# Theme management
├── pages/              # Page components
│   ├── admin/         # Admin pages
│   ├── faculty/       # Faculty pages
│   ├── student/       # Student pages
│   ├── shared/        # Shared pages
│   └── auth/          # Login/Register
└── services/          # API client
    └── api.js         # Axios instance
```

### Backend Structure

```
backend/
├── config/            # Configuration
│   └── database.php  # DB connection
├── controllers/       # API endpoints
│   ├── AuthController.php
│   ├── UserController.php
│   ├── ClassController.php
│   ├── GradeController.php
│   └── SubjectController.php
├── middleware/        # Request processing
│   └── AuthMiddleware.php
├── utils/            # Helper functions
│   ├── Response.php  # API responses
│   ├── Validator.php # Input validation
│   └── Logger.php    # Error logging
└── index.php         # Router
```

---

## 🔄 Data Flow

### 1. User Authentication Flow

```
User Login
    │
    ├─→ Frontend: Submit credentials
    │       │
    │       ├─→ POST /api/auth/login
    │       │
    │       └─→ Backend: AuthController
    │               │
    │               ├─→ Validate credentials
    │               ├─→ Generate session token
    │               └─→ Return user data + token
    │
    └─→ Frontend: Store token in localStorage
            │
            └─→ Include token in all API requests
```

### 2. Grade Encoding Flow

```
Faculty Enters Score
    │
    ├─→ Frontend: Update scoreMatrix state
    │       │
    │       ├─→ Trigger autosave (1.2s delay)
    │       │
    │       └─→ POST /api/grades/encode
    │               │
    │               └─→ Backend: GradeController
    │                       │
    │                       ├─→ Validate scores
    │                       ├─→ Save to grade_components
    │                       ├─→ Compute final grade
    │                       ├─→ Update grades table
    │                       └─→ Return updated data
    │
    └─→ Frontend: Update UI with saved data
```

### 3. Grade Computation Flow

```
Compute Grade Request
    │
    ├─→ Backend: computeGradeInternal()
    │       │
    │       ├─→ Fetch class attendance_weight
    │       ├─→ Fetch all grade components
    │       ├─→ Fetch attendance records
    │       │
    │       ├─→ Organize by term (midterm/final)
    │       ├─→ Calculate category averages
    │       │   ├─→ Major Exams (30%)
    │       │   ├─→ Quizzes (30%)
    │       │   └─→ Projects + Attendance (40%)
    │       │
    │       ├─→ Apply transmutation (0-50 → 50-100)
    │       ├─→ Calculate weighted score
    │       ├─→ Map to grade scale (1.0-5.0)
    │       └─→ Determine remarks (Passed/Failed)
    │
    └─→ Save to grades table
```

---

## 🗄️ Database Architecture

### Entity Relationship

```
users (1) ──────────────────────────────────┐
  │                                          │
  │ (1:N)                                    │ (1:N)
  │                                          │
  ├─→ class_records (faculty_id)            │
  │       │                                  │
  │       │ (1:N)                            │
  │       │                                  │
  │       └─→ enrollments ←──────────────────┘
  │               │         (student_id)
  │               │
  │               │ (1:N)
  │               │
  │               ├─→ grade_components
  │               ├─→ grades (1:1)
  │               └─→ attendance_records
  │
  └─→ subjects (created_by)
```

### Key Tables

**users**
- Stores all system users (admin, faculty, students)
- Role-based differentiation
- Authentication credentials

**class_records**
- Class instances per semester
- Links faculty to subject
- Stores attendance_weight setting

**enrollments**
- Student-class assignments
- Junction table

**grade_components**
- Individual score entries
- Category: major_exam, quiz, project
- Includes auto-generated Attendance component

**grades**
- Computed final grades
- Weighted scores and remarks
- One per enrollment

**attendance_records**
- Dated attendance entries
- Present = 1 point, Absent = 0
- Unique per enrollment + date

---

## 🔐 Security Architecture

### Authentication Flow

```
1. User submits credentials
2. Backend validates against users table
3. Generate session token (JWT-like)
4. Store token in localStorage
5. Include token in Authorization header
6. Middleware validates token on each request
7. Extract user_id and role from token
8. Authorize based on role
```

### Authorization Levels

| Role | Access |
|------|--------|
| Admin | Full system access |
| Faculty | Own classes only |
| Student | Own grades only |
| Dean | All classes (read) |
| Program Chair | Program classes (read) |

### Security Measures

- ✅ Password hashing (bcrypt, cost 10)
- ✅ Prepared statements (SQL injection prevention)
- ✅ Input validation (Validator utility)
- ✅ Output encoding (XSS prevention)
- ✅ CORS headers (Cross-origin control)
- ✅ Session timeout
- ✅ Audit logging

---

## 📊 Performance Considerations

### Frontend Optimization
- Code splitting (React.lazy)
- Memoization (useMemo, useCallback)
- Debounced autosave (1.2s delay)
- Optimistic UI updates

### Backend Optimization
- Database indexing
- Query optimization
- Connection pooling
- Response caching (where applicable)

### Database Optimization
- Indexed foreign keys
- Composite indexes on frequent queries
- Normalized schema (3NF)
- Efficient data types

---

## 🔄 State Management

### Frontend State

**Global State (Context API)**
- AuthContext: User session, login/logout
- ThemeContext: Light/dark mode

**Local State (useState)**
- Component-specific data
- Form inputs
- UI toggles

**Server State**
- Fetched via API calls
- Cached in component state
- Refreshed on mutations

### Backend State

**Stateless API**
- No server-side sessions
- Token-based authentication
- Each request is independent

---

## 📈 Scalability

### Horizontal Scaling
- Stateless backend allows multiple instances
- Load balancer distribution
- Database replication (read replicas)

### Vertical Scaling
- Increase server resources
- Optimize database queries
- Add caching layer (Redis)

### Future Enhancements
- Microservices architecture
- Message queue (async processing)
- CDN for static assets
- Database sharding

---

## 🧪 Testing Strategy

### Frontend Testing
- Unit tests (Jest)
- Component tests (React Testing Library)
- E2E tests (Cypress)

### Backend Testing
- Unit tests (PHPUnit)
- Integration tests
- API tests (Postman/Newman)

### Database Testing
- Schema validation
- Migration testing
- Data integrity checks

---

## 📚 Related Documentation

- [Database Schema](DATABASE_SCHEMA.md)
- [API Design](API_DESIGN.md)
- [Security](SECURITY.md)
- [Deployment](DEPLOYMENT.md)

---

**Architecture Version:** 2.0  
**Last Updated:** 2024
