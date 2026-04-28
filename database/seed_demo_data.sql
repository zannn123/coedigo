-- ============================================================
-- C.O.E.D.I.G.O. Demo Seed Data
-- Adds 1,000 demo users: 60 faculty and 940 students.
-- Also adds subject catalog data, class records, enrollments,
-- and computed grades for realistic dashboards and reports.
--
-- Run after database/coedigo.sql:
--   mysql -u root -p coedigo_db < database/seed_demo_data.sql
--
-- Seeded demo account password hash matches the base schema hash.
-- ============================================================

USE coedigo_db;

DROP PROCEDURE IF EXISTS seed_coedigo_demo_data;

DELIMITER $$

CREATE PROCEDURE seed_coedigo_demo_data()
BEGIN
    DECLARE i INT DEFAULT 1;
    DECLARE j INT DEFAULT 1;
    DECLARE v_admin_id INT;
    DECLARE v_student_user_id INT;
    DECLARE v_class_id INT;
    DECLARE v_class_count INT;
    DECLARE v_class_offset INT;
    DECLARE v_program VARCHAR(150);
    DECLARE v_department VARCHAR(100) DEFAULT 'College of Engineering';
    DECLARE v_first_name VARCHAR(100);
    DECLARE v_middle_name VARCHAR(100);
    DECLARE v_last_name VARCHAR(100);
    DECLARE v_year_level TINYINT;
    DECLARE v_hash VARCHAR(255) DEFAULT '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

    INSERT IGNORE INTO users (
        employee_id, first_name, last_name, email, password_hash, role, department, is_active
    ) VALUES (
        'ADM-0001',
        'System',
        'Administrator',
        'admin@jrmsu.edu.ph',
        v_hash,
        'admin',
        v_department,
        1
    );

    SELECT id INTO v_admin_id
    FROM users
    WHERE employee_id = 'ADM-0001'
       OR email = 'admin@jrmsu.edu.ph'
       OR role = 'admin'
    ORDER BY
        CASE
            WHEN employee_id = 'ADM-0001' THEN 1
            WHEN email = 'admin@jrmsu.edu.ph' THEN 2
            ELSE 3
        END,
        id
    LIMIT 1;

    WHILE i <= 60 DO
        SET v_program = ELT(((i - 1) MOD 4) + 1, 'BSCE', 'BSEE', 'BSCpE', 'BSME');
        SET v_first_name = ELT(((i - 1) MOD 20) + 1,
            'Aaron', 'Beatrice', 'Carlos', 'Diana', 'Edwin',
            'Fatima', 'Gabriel', 'Hannah', 'Ivan', 'Jasmine',
            'Kenneth', 'Lara', 'Miguel', 'Nina', 'Oscar',
            'Patricia', 'Rafael', 'Sofia', 'Tristan', 'Yasmin'
        );
        SET v_middle_name = ELT(((i - 1) MOD 10) + 1,
            'A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'H.', 'I.', 'J.'
        );
        SET v_last_name = ELT(((i - 1) MOD 24) + 1,
            'Abad', 'Bautista', 'Cabrera', 'Dela Cruz', 'Espina', 'Flores',
            'Garcia', 'Hernandez', 'Ilagan', 'Javier', 'Lim', 'Mendoza',
            'Navarro', 'Ocampo', 'Pascual', 'Quinto', 'Reyes', 'Santos',
            'Torres', 'Uy', 'Valdez', 'Yap', 'Zamora', 'Villanueva'
        );

        INSERT IGNORE INTO users (
            employee_id, first_name, middle_name, last_name, email, password_hash,
            role, department, program, contact_number, is_active
        ) VALUES (
            CONCAT('FAC-DEMO-', LPAD(i, 4, '0')),
            v_first_name,
            v_middle_name,
            v_last_name,
            CONCAT('faculty', LPAD(i, 4, '0'), '@coedigo.local'),
            v_hash,
            'faculty',
            v_department,
            v_program,
            CONCAT('09', LPAD(700000000 + i, 9, '0')),
            1
        );

        SET i = i + 1;
    END WHILE;

    SET i = 1;
    WHILE i <= 940 DO
        SET v_program = ELT(((i - 1) MOD 4) + 1, 'BSCE', 'BSEE', 'BSCpE', 'BSME');
        SET v_year_level = ((i - 1) MOD 5) + 1;
        SET v_first_name = ELT(((i - 1) MOD 30) + 1,
            'Adrian', 'Alyssa', 'Bianca', 'Bryan', 'Camille', 'Cedric',
            'Clarisse', 'Daniel', 'Elaine', 'Francis', 'Gina', 'Harold',
            'Irene', 'Jomari', 'Katrina', 'Leo', 'Maureen', 'Nathan',
            'Olivia', 'Paolo', 'Queenie', 'Ramon', 'Shaira', 'Toni',
            'Ulysses', 'Vanessa', 'Warren', 'Xandra', 'Yvonne', 'Zion'
        );
        SET v_middle_name = ELT(((i - 1) MOD 10) + 1,
            'A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'H.', 'I.', 'J.'
        );
        SET v_last_name = ELT(((i - 1) MOD 35) + 1,
            'Aguilar', 'Alvarez', 'Aquino', 'Baluyot', 'Basilio', 'Castillo',
            'Chavez', 'Cruz', 'Domingo', 'Enriquez', 'Fernandez', 'Francisco',
            'Gonzales', 'Gutierrez', 'Herrera', 'Jacinto', 'Lazaro', 'Lopez',
            'Magno', 'Manalo', 'Marquez', 'Morales', 'Natividad', 'Ortega',
            'Panganiban', 'Perez', 'Ramos', 'Rivera', 'Robles', 'Salazar',
            'Santiago', 'Soriano', 'Tolentino', 'Velasco', 'Vergara'
        );

        INSERT IGNORE INTO users (
            student_id, first_name, middle_name, last_name, email, password_hash,
            role, department, program, year_level, contact_number, is_active
        ) VALUES (
            CONCAT('STU-DEMO-', LPAD(i, 4, '0')),
            v_first_name,
            v_middle_name,
            v_last_name,
            CONCAT('student', LPAD(i, 4, '0'), '@coedigo.local'),
            v_hash,
            'student',
            v_department,
            v_program,
            v_year_level,
            CONCAT('09', LPAD(800000000 + i, 9, '0')),
            1
        );

        SET i = i + 1;
    END WHILE;

    CREATE TEMPORARY TABLE IF NOT EXISTS seed_subject_catalog (
        code VARCHAR(20) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description VARCHAR(500),
        units DECIMAL(3,1) NOT NULL,
        program VARCHAR(150) NOT NULL,
        faculty_slot INT NOT NULL
    );

    TRUNCATE TABLE seed_subject_catalog;

    INSERT INTO seed_subject_catalog (code, name, description, units, program, faculty_slot) VALUES
    ('CE101', 'Engineering Drawing', 'Fundamentals of technical drawing and visualization.', 2.0, 'BSCE', 1),
    ('CE102', 'Statics of Rigid Bodies', 'Force systems and equilibrium of rigid bodies.', 3.0, 'BSCE', 2),
    ('CE201', 'Mechanics of Deformable Bodies', 'Stress, strain, torsion, bending, and deflection.', 3.0, 'BSCE', 3),
    ('CE202', 'Fluid Mechanics', 'Fluid properties, pressure, flow, and hydraulic principles.', 3.0, 'BSCE', 4),
    ('CE301', 'Structural Theory', 'Analysis of determinate and indeterminate structures.', 3.0, 'BSCE', 5),
    ('CE302', 'Geotechnical Engineering', 'Soil behavior, compaction, seepage, and foundations.', 3.0, 'BSCE', 6),
    ('CE401', 'Transportation Engineering', 'Highway planning, traffic flow, and pavement design.', 3.0, 'BSCE', 7),
    ('CE402', 'Construction Project Management', 'Planning, scheduling, estimating, and project control.', 3.0, 'BSCE', 8),
    ('CE501', 'Reinforced Concrete Design', 'Design of reinforced concrete beams, slabs, and columns.', 3.0, 'BSCE', 9),

    ('EE101', 'Circuit Analysis 1', 'Basic DC and AC circuit laws and analysis methods.', 3.0, 'BSEE', 16),
    ('EE102', 'Electrical Measurements', 'Electrical instrumentation and measurement techniques.', 2.0, 'BSEE', 17),
    ('EE201', 'Electromagnetics', 'Electric and magnetic fields for engineering applications.', 3.0, 'BSEE', 18),
    ('EE202', 'Electronics 1', 'Semiconductor devices and basic electronic circuits.', 3.0, 'BSEE', 19),
    ('EE301', 'Power Systems Analysis', 'Generation, transmission, distribution, and fault analysis.', 3.0, 'BSEE', 20),
    ('EE302', 'Electrical Machines', 'Transformers, motors, generators, and machine performance.', 3.0, 'BSEE', 21),
    ('EE401', 'Control Systems', 'Feedback systems, stability, and controller design.', 3.0, 'BSEE', 22),
    ('EE402', 'Power Plant Engineering', 'Power generation technologies and plant operations.', 3.0, 'BSEE', 23),
    ('EE501', 'Electrical Design', 'Electrical plans, load schedules, and code compliance.', 3.0, 'BSEE', 24),

    ('CPE101', 'Programming Logic and Design', 'Algorithmic thinking and introductory programming.', 3.0, 'BSCpE', 31),
    ('CPE102', 'Object-Oriented Programming', 'Classes, objects, encapsulation, and application design.', 3.0, 'BSCpE', 32),
    ('CPE201', 'Data Structures and Algorithms', 'Lists, trees, graphs, searching, and sorting.', 3.0, 'BSCpE', 33),
    ('CPE202', 'Digital Logic Design', 'Logic gates, combinational circuits, and sequential systems.', 3.0, 'BSCpE', 34),
    ('CPE301', 'Computer Architecture', 'Processor organization, memory systems, and I/O.', 3.0, 'BSCpE', 35),
    ('CPE302', 'Embedded Systems', 'Microcontrollers, sensors, actuators, and firmware.', 3.0, 'BSCpE', 36),
    ('CPE401', 'Software Engineering', 'Requirements, design, testing, and software project practice.', 3.0, 'BSCpE', 37),
    ('CPE402', 'Computer Networks', 'Network models, routing, switching, and protocols.', 3.0, 'BSCpE', 38),
    ('CPE501', 'Capstone Design 1', 'Proposal development and prototype planning.', 3.0, 'BSCpE', 39),

    ('ME101', 'Engineering Mechanics', 'Particle and rigid body mechanics for mechanical systems.', 3.0, 'BSME', 46),
    ('ME102', 'Workshop Theory and Practice', 'Machine tools, safety, and basic fabrication.', 2.0, 'BSME', 47),
    ('ME201', 'Thermodynamics 1', 'Properties, energy, entropy, and power cycles.', 3.0, 'BSME', 48),
    ('ME202', 'Machine Design 1', 'Design of shafts, fasteners, springs, and machine elements.', 3.0, 'BSME', 49),
    ('ME301', 'Heat Transfer', 'Conduction, convection, radiation, and heat exchangers.', 3.0, 'BSME', 50),
    ('ME302', 'Dynamics of Machinery', 'Kinematics and dynamics of machine components.', 3.0, 'BSME', 51),
    ('ME401', 'Refrigeration and Air Conditioning', 'Cooling cycles, psychrometrics, and HVAC systems.', 3.0, 'BSME', 52),
    ('ME402', 'Power Plant Engineering', 'Steam, gas, diesel, and renewable power systems.', 3.0, 'BSME', 53),
    ('ME501', 'Mechanical Systems Design', 'Integrated design of mechanical engineering systems.', 3.0, 'BSME', 54);

    INSERT INTO subjects (code, name, description, units, department, program, created_by)
    SELECT sc.code, sc.name, sc.description, sc.units, v_department, sc.program, v_admin_id
    FROM seed_subject_catalog sc
    LEFT JOIN subjects s ON s.code = sc.code
    WHERE s.id IS NULL;

    INSERT INTO class_records (
        subject_id, faculty_id, section, academic_year, semester, schedule, room, max_students
    )
    SELECT s.id, f.id, section_data.section, '2025-2026', '2nd',
        section_data.schedule,
        CONCAT('ENG-', LPAD(((sc.faculty_slot - 1) MOD 30) + 101, 3, '0')),
        45
    FROM seed_subject_catalog sc
    INNER JOIN subjects s ON s.code = sc.code
    INNER JOIN users f ON f.employee_id = CONCAT('FAC-DEMO-', LPAD(sc.faculty_slot, 4, '0'))
    CROSS JOIN (
        SELECT 'A' AS section, 'MWF 08:00-09:00 AM' AS schedule
        UNION ALL
        SELECT 'B', 'TTh 01:00-02:30 PM'
    ) section_data
    LEFT JOIN class_records cr
        ON cr.subject_id = s.id
        AND cr.section = section_data.section
        AND cr.academic_year = '2025-2026'
        AND cr.semester = '2nd'
    WHERE cr.id IS NULL;

    SET i = 1;
    WHILE i <= 940 DO
        SELECT id, program
        INTO v_student_user_id, v_program
        FROM users
        WHERE student_id = CONCAT('STU-DEMO-', LPAD(i, 4, '0'))
        LIMIT 1;

        SELECT COUNT(*)
        INTO v_class_count
        FROM class_records cr
        INNER JOIN subjects s ON s.id = cr.subject_id
        WHERE s.program = v_program
          AND cr.academic_year = '2025-2026'
          AND cr.semester = '2nd'
          AND cr.is_active = 1;

        SET j = 1;
        WHILE j <= 6 AND v_class_count > 0 DO
            SET v_class_offset = ((i + j - 2) MOD v_class_count);

            SELECT cr.id
            INTO v_class_id
            FROM class_records cr
            INNER JOIN subjects s ON s.id = cr.subject_id
            WHERE s.program = v_program
              AND cr.academic_year = '2025-2026'
              AND cr.semester = '2nd'
              AND cr.is_active = 1
            ORDER BY cr.id
            LIMIT v_class_offset, 1;

            INSERT IGNORE INTO enrollments (class_record_id, student_id, is_active)
            VALUES (v_class_id, v_student_user_id, 1);

            SET j = j + 1;
        END WHILE;

        SET i = i + 1;
    END WHILE;

    CREATE TEMPORARY TABLE IF NOT EXISTS seed_grade_component_defs (
        category VARCHAR(20) NOT NULL,
        component_name VARCHAR(100) NOT NULL,
        max_score DECIMAL(6,2) NOT NULL,
        sort_order INT NOT NULL,
        PRIMARY KEY (category, component_name)
    );

    TRUNCATE TABLE seed_grade_component_defs;

    INSERT INTO seed_grade_component_defs (category, component_name, max_score, sort_order) VALUES
    ('major_exam', 'Midterm Exam', 100.00, 1),
    ('major_exam', 'Final Exam', 100.00, 2),
    ('quiz', 'Quiz 1', 20.00, 3),
    ('quiz', 'Quiz 2', 20.00, 4),
    ('quiz', 'Quiz 3', 20.00, 5),
    ('quiz', 'Quiz 4', 20.00, 6),
    ('quiz', 'Quiz 5', 20.00, 7),
    ('project', 'Laboratory Activity 1', 50.00, 8),
    ('project', 'Laboratory Activity 2', 50.00, 9),
    ('project', 'Attendance', 8.00, 10);

    INSERT INTO grade_components (
        enrollment_id, category, component_name, max_score, score, encoded_by
    )
    SELECT
        e.id,
        d.category,
        d.component_name,
        d.max_score,
        CASE
            WHEN d.category = 'major_exam' THEN 72 + ((e.id + d.sort_order) MOD 25)
            WHEN d.category = 'quiz' THEN 12 + ((e.id + d.sort_order) MOD 9)
            WHEN d.component_name = 'Attendance' THEN 6 + (e.id MOD 3)
            ELSE 36 + ((e.id + d.sort_order) MOD 15)
        END AS score,
        cr.faculty_id
    FROM enrollments e
    INNER JOIN users u ON u.id = e.student_id
    INNER JOIN class_records cr ON cr.id = e.class_record_id
    CROSS JOIN seed_grade_component_defs d
    LEFT JOIN grade_components gc
        ON gc.enrollment_id = e.id
        AND gc.category = d.category
        AND gc.component_name = d.component_name
    WHERE u.student_id LIKE 'STU-DEMO-%'
      AND gc.id IS NULL;

    CREATE TEMPORARY TABLE IF NOT EXISTS seed_attendance_dates (
        attendance_date DATE PRIMARY KEY,
        sort_order INT NOT NULL
    );

    TRUNCATE TABLE seed_attendance_dates;

    INSERT INTO seed_attendance_dates (attendance_date, sort_order) VALUES
    ('2026-01-12', 1),
    ('2026-01-19', 2),
    ('2026-01-26', 3),
    ('2026-02-02', 4),
    ('2026-02-09', 5),
    ('2026-02-16', 6),
    ('2026-02-23', 7),
    ('2026-03-02', 8);

    INSERT INTO attendance_records (
        enrollment_id, attendance_date, status, points, encoded_by
    )
    SELECT
        e.id,
        d.attendance_date,
        CASE WHEN ((e.id + d.sort_order) MOD 11) = 0 THEN 'absent' ELSE 'present' END AS status,
        CASE WHEN ((e.id + d.sort_order) MOD 11) = 0 THEN 0.00 ELSE 1.00 END AS points,
        cr.faculty_id
    FROM enrollments e
    INNER JOIN users u ON u.id = e.student_id
    INNER JOIN class_records cr ON cr.id = e.class_record_id
    CROSS JOIN seed_attendance_dates d
    WHERE u.student_id LIKE 'STU-DEMO-%'
    ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        points = VALUES(points),
        encoded_by = VALUES(encoded_by),
        updated_at = NOW();

    UPDATE class_records cr
    INNER JOIN subjects s ON s.id = cr.subject_id
    SET
        cr.grade_status = CASE
            WHEN (cr.id MOD 3) = 0 THEN 'officially_released'
            WHEN (cr.id MOD 3) = 1 THEN 'faculty_verified'
            ELSE 'draft'
        END,
        cr.verified_at = CASE
            WHEN (cr.id MOD 3) IN (0, 1) THEN DATE_SUB(NOW(), INTERVAL ((cr.id MOD 10) + 1) DAY)
            ELSE NULL
        END,
        cr.released_at = CASE
            WHEN (cr.id MOD 3) = 0 THEN DATE_SUB(NOW(), INTERVAL (cr.id MOD 5) DAY)
            ELSE NULL
        END
    WHERE s.code IN (SELECT code FROM seed_subject_catalog)
      AND cr.academic_year = '2025-2026'
      AND cr.semester = '2nd';

    INSERT IGNORE INTO grades (
        enrollment_id,
        major_exam_avg,
        quiz_avg,
        project_avg,
        weighted_score,
        final_grade,
        remarks,
        computed_at
    )
    SELECT
        e.id,
        72 + (e.id MOD 25),
        70 + ((e.id * 3) MOD 27),
        74 + ((e.id * 5) MOD 23),
        ROUND(
            ((72 + (e.id MOD 25)) * 0.30) +
            ((70 + ((e.id * 3) MOD 27)) * 0.30) +
            ((74 + ((e.id * 5) MOD 23)) * 0.40),
            2
        ) AS weighted_score,
        CASE
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 99 THEN 1.00
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 97 THEN 1.10
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 95 THEN 1.20
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 93 THEN 1.30
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 91 THEN 1.40
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 90 THEN 1.50
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 89 THEN 1.60
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 88 THEN 1.70
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 87 THEN 1.80
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 86 THEN 1.90
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 85 THEN 2.00
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 84 THEN 2.10
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 83 THEN 2.20
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 82 THEN 2.30
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 81 THEN 2.40
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 80 THEN 2.50
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 79 THEN 2.60
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 78 THEN 2.70
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 77 THEN 2.80
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 76 THEN 2.90
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 75 THEN 3.00
            ELSE 5.00
        END AS final_grade,
        CASE
            WHEN ROUND(
                ((72 + (e.id MOD 25)) * 0.30) +
                ((70 + ((e.id * 3) MOD 27)) * 0.30) +
                ((74 + ((e.id * 5) MOD 23)) * 0.40),
                2
            ) >= 75 THEN 'Passed'
            ELSE 'Failed'
        END AS remarks,
        NOW()
    FROM enrollments e
    INNER JOIN users u ON u.id = e.student_id
    WHERE u.student_id LIKE 'STU-DEMO-%';
END$$

DELIMITER ;

CALL seed_coedigo_demo_data();

DROP PROCEDURE IF EXISTS seed_coedigo_demo_data;
