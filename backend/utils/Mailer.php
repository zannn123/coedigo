<?php
/**
 * C.O.E.D.I.G.O. - SMTP Mail Utility
 * Sends transactional emails through Gmail or another SMTP server.
 */

require_once __DIR__ . '/Logger.php';

class Mailer {
    private $db;

    public function __construct($db) {
        $this->db = $db;
    }

    public function sendWelcomeCredentialsEmail($recipientEmail, $recipientName, $temporaryPassword, $role, $yearLevel = null) {
        $settings = $this->getMailSettings();

        if (empty($settings['smtp_host']) || empty($settings['smtp_username']) || empty($settings['smtp_password'])) {
            Logger::error('mail.welcome.skipped_missing_settings', [
                'recipient_email' => $recipientEmail,
                'has_smtp_host' => !empty($settings['smtp_host']),
                'has_smtp_username' => !empty($settings['smtp_username']),
                'has_smtp_password' => !empty($settings['smtp_password']),
            ]);
            return [
                'success' => false,
                'message' => 'SMTP settings are incomplete. Configure the Gmail address and app password first.',
            ];
        }

        $systemName = $settings['system_name'] ?: 'COEDIGO';
        $institutionName = $settings['institution_name'] ?: 'Jose Rizal Memorial State University';
        $collegeName = $settings['college_name'] ?: 'College of Engineering';
        $loginUrl = $this->getLoginUrl();
        $subject = "{$systemName} Account Credentials";
        $inlineAssets = $this->getInlineBrandAssets();

        // Get personalized content based on role and year level
        $personalizedContent = $this->getPersonalizedContent($role, $yearLevel, $recipientName, $collegeName, $institutionName);

        $plainText = implode("\r\n", [
            $personalizedContent['greeting'],
            "",
            "Hello {$recipientName},",
            "",
            $personalizedContent['message'],
            "Role: {$role}",
            "Email: {$recipientEmail}",
            "Temporary Password: {$temporaryPassword}",
            "",
            "Login here: {$loginUrl}",
            "",
            "For security, please sign in and change your password as soon as possible.",
            "",
            "Regards,",
            "{$systemName} Administration",
        ]);

        $coedigoLogoHtml = $this->renderInlineLogo($inlineAssets['coedigo'] ?? null, 118, 'COEDIGO');
        $engineeringLogoHtml = $this->renderInlineLogo($inlineAssets['engineering'] ?? null, 86, 'College of Engineering');

        $html = '
            <div style="margin:0;padding:0;background-color:#f7f1ea;font-family:Arial,Helvetica,sans-serif;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f7f1ea;">
                <tr>
                  <td align="center" style="padding:28px 14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background-color:#ffffff;border:1px solid #eadfce;border-radius:22px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
                      <tr>
                        <td style="padding:0;background:linear-gradient(135deg, ' . $personalizedContent['gradient_start'] . ' 0%, ' . $personalizedContent['gradient_end'] . ' 100%);position:relative;">
                          <div style="padding:26px 28px 22px;position:relative;z-index:2;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                              <tr>
                                <td align="left" valign="middle" style="width:50%;padding-right:10px;">' . $coedigoLogoHtml . '</td>
                                <td align="right" valign="middle" style="width:50%;padding-left:10px;">' . $engineeringLogoHtml . '</td>
                              </tr>
                            </table>
                            <div style="margin-top:24px;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:' . $personalizedContent['accent_color'] . ';">' . htmlspecialchars($personalizedContent['badge'], ENT_QUOTES, 'UTF-8') . '</div>
                            <div style="margin-top:10px;font-size:30px;line-height:1.08;font-weight:700;color:#111827;">' . htmlspecialchars($personalizedContent['title'], ENT_QUOTES, 'UTF-8') . '</div>
                            <div style="margin-top:12px;font-size:15px;line-height:1.75;color:#374151;max-width:520px;">
                              ' . htmlspecialchars($personalizedContent['subtitle'], ENT_QUOTES, 'UTF-8') . '
                            </div>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:28px 28px 30px;">
                          <div style="font-size:16px;line-height:1.6;color:#1f2937;margin-bottom:14px;font-weight:600;">
                            ' . htmlspecialchars($personalizedContent['greeting_line'], ENT_QUOTES, 'UTF-8') . '
                          </div>
                          <div style="font-size:14px;line-height:1.75;color:#4b5563;margin-bottom:18px;">
                            ' . htmlspecialchars($personalizedContent['intro_message'], ENT_QUOTES, 'UTF-8') . '
                          </div>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:2px solid ' . $personalizedContent['border_color'] . ';border-radius:16px;background-color:' . $personalizedContent['card_bg'] . ';margin-bottom:20px;">
                            <tr>
                              <td style="padding:18px 18px 10px;">
                                <div style="font-size:12px;line-height:1.4;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:' . $personalizedContent['accent_color'] . ';margin-bottom:10px;">Your Login Credentials</div>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:0 18px 18px;">
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                  <tr>
                                    <td style="padding:0 0 12px;font-size:13px;color:#6b7280;width:34%;">Role</td>
                                    <td style="padding:0 0 12px;font-size:14px;color:#111827;font-weight:700;">' . htmlspecialchars(ucwords(str_replace('_', ' ', $role)), ENT_QUOTES, 'UTF-8') . '</td>
                                  </tr>
                                  <tr>
                                    <td style="padding:0 0 12px;font-size:13px;color:#6b7280;">Email</td>
                                    <td style="padding:0 0 12px;font-size:14px;color:#111827;font-weight:700;">' . htmlspecialchars($recipientEmail, ENT_QUOTES, 'UTF-8') . '</td>
                                  </tr>
                                  <tr>
                                    <td style="padding:0;font-size:13px;color:#6b7280;">Temporary Password</td>
                                    <td style="padding:0;font-size:18px;color:' . $personalizedContent['accent_color'] . ';font-weight:700;letter-spacing:0.4px;">' . htmlspecialchars($temporaryPassword, ENT_QUOTES, 'UTF-8') . '</td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" bgcolor="' . $personalizedContent['button_bg'] . '" style="border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.12);">
                                <a href="' . htmlspecialchars($loginUrl, ENT_QUOTES, 'UTF-8') . '" style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Access COEDIGO Now</a>
                              </td>
                            </tr>
                          </table>
                          <div style="margin-top:20px;padding:14px;background-color:#f9fafb;border-left:3px solid ' . $personalizedContent['accent_color'] . ';border-radius:6px;">
                            <div style="font-size:12px;line-height:1.7;color:#374151;">
                              <strong style="color:#111827;">Security Reminder:</strong> Change your password immediately after your first login. Keep your credentials confidential.
                            </div>
                          </div>
                          <div style="margin-top:18px;font-size:12px;line-height:1.7;color:#6b7280;text-align:center;">
                            Questions? Contact the ' . htmlspecialchars($collegeName, ENT_QUOTES, 'UTF-8') . ' office.<br>
                            This is an automated message from ' . htmlspecialchars($systemName, ENT_QUOTES, 'UTF-8') . '.
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </div>
        ';

        try {
            $this->sendSmtpEmail($settings, [
                'to' => $recipientEmail,
                'subject' => $subject,
                'text' => $plainText,
                'html' => $html,
                'inline_attachments' => array_values($inlineAssets),
            ]);

            Logger::info('mail.welcome.sent', [
                'recipient_email' => $recipientEmail,
                'role' => $role,
                'year_level' => $yearLevel,
                'subject' => $subject,
                'transport' => 'smtp',
                'smtp_host' => $settings['smtp_host'],
                'smtp_port' => $settings['smtp_port'],
                'smtp_encryption' => $settings['smtp_encryption'],
            ]);

            return [
                'success' => true,
                'message' => 'Welcome email sent successfully.',
            ];
        } catch (Exception $e) {
            Logger::error('mail.welcome.failed', [
                'recipient_email' => $recipientEmail,
                'role' => $role,
                'smtp_host' => $settings['smtp_host'] ?? null,
                'smtp_port' => $settings['smtp_port'] ?? null,
                'smtp_encryption' => $settings['smtp_encryption'] ?? null,
                'message' => $e->getMessage(),
            ]);
            return [
                'success' => false,
                'message' => $e->getMessage(),
            ];
        }
    }

    private function getPersonalizedContent($role, $yearLevel, $recipientName, $collegeName, $institutionName) {
        $content = [];

        // Determine if student is a freshman
        $isFreshman = ($role === 'student' && ($yearLevel === '1st' || $yearLevel === '1'));

        if ($role === 'student') {
            if ($isFreshman) {
                // Freshman students
                $content = [
                    'badge' => 'WELCOME FRESHIES',
                    'title' => 'Welcome, Future Engineer!',
                    'subtitle' => 'Your journey to becoming an engineer starts here. Access your grades, attendance, and class records all in one place.',
                    'greeting_line' => 'Hello ' . $recipientName . ', Welcome to Engineering!',
                    'intro_message' => 'Congratulations on joining the College of Engineering! Your COEDIGO account is ready. Use the credentials below to access your academic portal.',
                    'gradient_start' => '#dbeafe',
                    'gradient_end' => '#bfdbfe',
                    'accent_color' => '#1d4ed8',
                    'border_color' => '#93c5fd',
                    'card_bg' => '#eff6ff',
                    'button_bg' => '#2563eb',
                ];
            } else {
                // Senior students (2nd year and up)
                $content = [
                    'badge' => 'ACCOUNT READY',
                    'title' => 'Hello, Future Engineer!',
                    'subtitle' => 'Continue your engineering journey with seamless access to your academic records, grades, and class information.',
                    'greeting_line' => 'Hello ' . $recipientName . ',',
                    'intro_message' => 'Your COEDIGO account has been set up. Sign in to view your grades, track attendance, and stay updated with your academic progress.',
                    'gradient_start' => '#d1fae5',
                    'gradient_end' => '#a7f3d0',
                    'accent_color' => '#047857',
                    'border_color' => '#6ee7b7',
                    'card_bg' => '#ecfdf5',
                    'button_bg' => '#059669',
                ];
            }
        } elseif ($role === 'faculty') {
            $content = [
                'badge' => 'FACULTY ACCESS',
                'title' => 'Welcome, Esteemed Faculty!',
                'subtitle' => 'Your teaching portal is ready. Manage class records, encode grades, track attendance, and monitor student performance with ease.',
                'greeting_line' => 'Dear Professor ' . $recipientName . ',',
                'intro_message' => 'Your faculty account has been created. Access your classes, manage grade books, and streamline your academic responsibilities through COEDIGO.',
                'gradient_start' => '#fef3c7',
                'gradient_end' => '#fde68a',
                'accent_color' => '#b45309',
                'border_color' => '#fcd34d',
                'card_bg' => '#fffbeb',
                'button_bg' => '#d97706',
            ];
        } elseif ($role === 'dean') {
            $content = [
                'badge' => 'DEAN PORTAL ACCESS',
                'title' => 'Welcome, Dean!',
                'subtitle' => 'Your administrative dashboard awaits. Oversee college operations, monitor academic performance, and manage institutional records.',
                'greeting_line' => 'Dear Dean ' . $recipientName . ',',
                'intro_message' => 'Your Dean account is now active. Access comprehensive reports, verify grades, and oversee the academic excellence of the College of Engineering.',
                'gradient_start' => '#e9d5ff',
                'gradient_end' => '#d8b4fe',
                'accent_color' => '#7c3aed',
                'border_color' => '#c4b5fd',
                'card_bg' => '#faf5ff',
                'button_bg' => '#8b5cf6',
            ];
        } elseif ($role === 'program_chair') {
            $content = [
                'badge' => 'PROGRAM CHAIR ACCESS',
                'title' => 'Welcome, Program Chair!',
                'subtitle' => 'Lead your program with confidence. Monitor curriculum delivery, track student progress, and ensure academic quality across your department.',
                'greeting_line' => 'Dear Program Chair ' . $recipientName . ',',
                'intro_message' => 'Your Program Chair account is ready. Access program-wide analytics, review class records, and guide your department toward excellence.',
                'gradient_start' => '#fce7f3',
                'gradient_end' => '#fbcfe8',
                'accent_color' => '#be185d',
                'border_color' => '#f9a8d4',
                'card_bg' => '#fdf2f8',
                'button_bg' => '#db2777',
            ];
        } else {
            // Default for admin or other roles
            $content = [
                'badge' => 'ACCOUNT READY',
                'title' => 'Welcome to COEDIGO!',
                'subtitle' => 'Your account has been created for ' . $collegeName . ' at ' . $institutionName . '. Access your portal to get started.',
                'greeting_line' => 'Hello ' . $recipientName . ',',
                'intro_message' => 'Your account has been successfully created. Use the credentials below to sign in and explore the system.',
                'gradient_start' => '#fff7ed',
                'gradient_end' => '#fed7aa',
                'accent_color' => '#c2410c',
                'border_color' => '#fdba74',
                'card_bg' => '#fff7ed',
                'button_bg' => '#ea580c',
            ];
        }

        $content['greeting'] = $content['title'];
        $content['message'] = $content['subtitle'];

        return $content;
    }

    private function getMailSettings() {
        $defaults = [
            'institution_name' => getenv('INSTITUTION_NAME') ?: 'Jose Rizal Memorial State University',
            'college_name' => getenv('COLLEGE_NAME') ?: 'College of Engineering',
            'system_name' => getenv('SYSTEM_NAME') ?: 'COEDIGO',
            'smtp_host' => getenv('SMTP_HOST') ?: 'smtp.gmail.com',
            'smtp_port' => getenv('SMTP_PORT') ?: '465',
            'smtp_username' => getenv('SMTP_USERNAME') ?: (getenv('GMAIL_ADDRESS') ?: ''),
            'smtp_password' => getenv('SMTP_PASSWORD') ?: (getenv('GMAIL_APP_PASSWORD') ?: ''),
            'smtp_encryption' => getenv('SMTP_ENCRYPTION') ?: 'ssl',
            'mail_from_address' => getenv('MAIL_FROM_ADDRESS') ?: '',
            'mail_from_name' => getenv('MAIL_FROM_NAME') ?: 'COEDIGO',
            'mail_reply_to' => getenv('MAIL_REPLY_TO') ?: '',
        ];

        try {
            $stmt = $this->db->query("
                SELECT setting_key, setting_value
                FROM system_settings
                WHERE setting_key IN (
                    'institution_name',
                    'college_name',
                    'system_name',
                    'smtp_host',
                    'smtp_port',
                    'smtp_username',
                    'smtp_password',
                    'smtp_encryption',
                    'mail_from_address',
                    'mail_from_name',
                    'mail_reply_to'
                )
            ");

            foreach ($stmt->fetchAll() as $row) {
                if ($row['setting_value'] !== null && $row['setting_value'] !== '') {
                    $defaults[$row['setting_key']] = $row['setting_value'];
                }
            }
        } catch (Exception $e) {
            // Fall back to environment defaults when settings are unavailable.
        }

        if (empty($defaults['mail_from_address'])) {
            $defaults['mail_from_address'] = $defaults['smtp_username'];
        }

        $defaults['smtp_port'] = (int)$defaults['smtp_port'] > 0 ? (int)$defaults['smtp_port'] : 465;
        $defaults['smtp_encryption'] = strtolower((string)$defaults['smtp_encryption']);
        if (!in_array($defaults['smtp_encryption'], ['ssl', 'tls', 'none'], true)) {
            $defaults['smtp_encryption'] = 'ssl';
        }

        return $defaults;
    }

    private function getLoginUrl() {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
        if ($origin) {
            return rtrim($origin, '/') . '/login';
        }

        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        return "{$scheme}://{$host}/login";
    }

    private function sendSmtpEmail(array $settings, array $message) {
        $fromAddress = $this->sanitizeEmail($settings['mail_from_address'] ?: $settings['smtp_username']);
        $fromName = $this->sanitizeHeaderText($settings['mail_from_name'] ?: 'COEDIGO');
        $replyTo = $this->sanitizeEmail($settings['mail_reply_to'] ?? '');
        $toAddress = $this->sanitizeEmail($message['to']);
        $subject = $this->sanitizeHeaderText($message['subject']);
        $inlineAttachments = $message['inline_attachments'] ?? [];
        $mimeMessage = $this->buildMimeMessage($fromAddress, $fromName, $replyTo, $toAddress, $subject, $message['text'], $message['html'], $inlineAttachments);

        if (function_exists('curl_init')) {
            $this->sendWithCurl($settings, $fromAddress, $toAddress, $mimeMessage);
            return;
        }

        $this->sendWithSocket($settings, $fromAddress, $toAddress, $mimeMessage);
    }

    private function sendWithCurl(array $settings, $fromAddress, $toAddress, $mimeMessage) {
        $scheme = $settings['smtp_encryption'] === 'ssl' ? 'smtps' : 'smtp';
        $url = sprintf('%s://%s:%d', $scheme, $settings['smtp_host'], (int)$settings['smtp_port']);
        $handle = fopen('php://temp', 'r+');
        fwrite($handle, $mimeMessage);
        rewind($handle);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_USERNAME => $settings['smtp_username'],
            CURLOPT_PASSWORD => $settings['smtp_password'],
            CURLOPT_MAIL_FROM => '<' . $fromAddress . '>',
            CURLOPT_MAIL_RCPT => ['<' . $toAddress . '>'],
            CURLOPT_UPLOAD => true,
            CURLOPT_READDATA => $handle,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_USE_SSL => $settings['smtp_encryption'] === 'none' ? CURLUSESSL_NONE : CURLUSESSL_ALL,
        ]);

        if ($settings['smtp_encryption'] === 'tls') {
            curl_setopt($ch, CURLOPT_USE_SSL, CURLUSESSL_ALL);
        }

        $result = curl_exec($ch);
        $responseCode = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);

        if ($result === false) {
            $error = curl_error($ch);
            curl_close($ch);
            fclose($handle);
            throw new RuntimeException('SMTP request failed: ' . $error);
        }

        curl_close($ch);
        fclose($handle);

        if ($responseCode >= 400) {
            throw new RuntimeException('SMTP server rejected the message with code ' . $responseCode . '.');
        }
    }

    private function sendWithSocket(array $settings, $fromAddress, $toAddress, $mimeMessage) {
        $transport = $settings['smtp_encryption'] === 'ssl' ? 'ssl://' : 'tcp://';
        $socket = @stream_socket_client(
            $transport . $settings['smtp_host'] . ':' . (int)$settings['smtp_port'],
            $errno,
            $errstr,
            30,
            STREAM_CLIENT_CONNECT
        );

        if (!$socket) {
            throw new RuntimeException('SMTP connection failed: ' . $errstr);
        }

        stream_set_timeout($socket, 30);

        try {
            $this->smtpExpect($socket, [220]);
            $this->smtpCommand($socket, 'EHLO localhost', [250]);

            if ($settings['smtp_encryption'] === 'tls') {
                $this->smtpCommand($socket, 'STARTTLS', [220]);

                if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new RuntimeException('SMTP STARTTLS negotiation failed.');
                }

                $this->smtpCommand($socket, 'EHLO localhost', [250]);
            }

            $this->smtpCommand($socket, 'AUTH LOGIN', [334]);
            $this->smtpCommand($socket, base64_encode($settings['smtp_username']), [334]);
            $this->smtpCommand($socket, base64_encode($settings['smtp_password']), [235]);
            $this->smtpCommand($socket, 'MAIL FROM:<' . $fromAddress . '>', [250]);
            $this->smtpCommand($socket, 'RCPT TO:<' . $toAddress . '>', [250, 251]);
            $this->smtpCommand($socket, 'DATA', [354]);
            fwrite($socket, $this->dotStuff($mimeMessage) . "\r\n.\r\n");
            $this->smtpExpect($socket, [250]);
            $this->smtpCommand($socket, 'QUIT', [221]);
        } finally {
            fclose($socket);
        }
    }

    private function smtpCommand($socket, $command, array $expectedCodes) {
        fwrite($socket, $command . "\r\n");
        return $this->smtpExpect($socket, $expectedCodes, $command);
    }

    private function smtpExpect($socket, array $expectedCodes, $command = null) {
        $response = '';
        $code = 0;

        while (($line = fgets($socket, 515)) !== false) {
            $response .= $line;
            if (preg_match('/^(\d{3})([ -])/', $line, $matches)) {
                $code = (int)$matches[1];
                if ($matches[2] === ' ') {
                    break;
                }
            }
        }

        if (!$code || !in_array($code, $expectedCodes, true)) {
            Logger::error('mail.smtp.response_error', [
                'command' => $command,
                'expected_codes' => $expectedCodes,
                'response' => trim($response),
            ]);
            throw new RuntimeException('SMTP error' . ($command ? " after {$command}" : '') . ': ' . trim($response));
        }

        return $response;
    }

    private function buildMimeMessage($fromAddress, $fromName, $replyTo, $toAddress, $subject, $plainText, $html, array $inlineAttachments = []) {
        $relatedBoundary = 'rel_' . bin2hex(random_bytes(12));
        $alternativeBoundary = 'alt_' . bin2hex(random_bytes(12));
        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . $this->formatSender($fromAddress, $fromName),
            'To: <' . $toAddress . '>',
            'Subject: ' . $this->encodeHeader($subject),
            'MIME-Version: 1.0',
            'Content-Type: multipart/related; boundary="' . $relatedBoundary . '"',
        ];

        if ($replyTo !== '') {
            $headers[] = 'Reply-To: <' . $replyTo . '>';
        }

        $sections = [
            '--' . $relatedBoundary,
            'Content-Type: multipart/alternative; boundary="' . $alternativeBoundary . '"',
            '',
            '--' . $alternativeBoundary,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            $plainText,
            '',
            '--' . $alternativeBoundary,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            $html,
            '',
            '--' . $alternativeBoundary . '--',
            '',
        ];

        foreach ($inlineAttachments as $attachment) {
            if (empty($attachment['path']) || !is_readable($attachment['path'])) {
                continue;
            }

            $encoded = chunk_split(base64_encode((string)file_get_contents($attachment['path'])));
            $sections[] = '--' . $relatedBoundary;
            $sections[] = 'Content-Type: ' . ($attachment['mime'] ?? 'application/octet-stream') . '; name="' . ($attachment['name'] ?? 'file') . '"';
            $sections[] = 'Content-Transfer-Encoding: base64';
            $sections[] = 'Content-ID: <' . $attachment['cid'] . '>';
            $sections[] = 'Content-Disposition: inline; filename="' . ($attachment['name'] ?? 'file') . '"';
            $sections[] = '';
            $sections[] = trim($encoded);
            $sections[] = '';
        }

        $sections[] = '--' . $relatedBoundary . '--';
        $sections[] = '';

        return implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $sections);
    }

    private function formatSender($email, $name = '') {
        $cleanEmail = $this->sanitizeEmail($email);
        $cleanName = $this->sanitizeHeaderText($name);

        if ($cleanName === '') {
            return '<' . $cleanEmail . '>';
        }

        return $this->encodeHeader($cleanName) . ' <' . $cleanEmail . '>';
    }

    private function sanitizeEmail($email) {
        return trim(str_replace(["\r", "\n", '<', '>'], '', (string)$email));
    }

    private function sanitizeHeaderText($value) {
        return trim(str_replace(["\r", "\n"], '', (string)$value));
    }

    private function encodeHeader($value) {
        if ($value === '' || preg_match('/^[\x20-\x7E]+$/', $value)) {
            return $value;
        }

        return '=?UTF-8?B?' . base64_encode($value) . '?=';
    }

    private function dotStuff($message) {
        $normalized = str_replace(["\r\n", "\r"], "\n", $message);
        $normalized = preg_replace('/^\./m', '..', $normalized);
        return str_replace("\n", "\r\n", $normalized);
    }

    private function getInlineBrandAssets() {
        $assetDirectory = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'email';
        $definitions = [
            'coedigo' => [
                'cid' => 'coedigo-logo',
                'name' => 'coedigo-logo.png',
                'path' => $assetDirectory . DIRECTORY_SEPARATOR . 'coedigo-logo.png',
                'mime' => 'image/png',
            ],
            'engineering' => [
                'cid' => 'engineering-logo',
                'name' => 'engineering-logo.png',
                'path' => $assetDirectory . DIRECTORY_SEPARATOR . 'engineering-logo.png',
                'mime' => 'image/png',
            ],
        ];

        $assets = [];
        foreach ($definitions as $key => $definition) {
            if (is_readable($definition['path'])) {
                $assets[$key] = $definition;
            }
        }

        return $assets;
    }

    private function renderInlineLogo($asset, $width, $alt) {
        if (!$asset) {
            return '<div style="font-size:12px;line-height:1.4;font-weight:700;color:#111827;">' . htmlspecialchars($alt, ENT_QUOTES, 'UTF-8') . '</div>';
        }

        return '<img src="cid:' . htmlspecialchars($asset['cid'], ENT_QUOTES, 'UTF-8') . '" alt="' . htmlspecialchars($alt, ENT_QUOTES, 'UTF-8') . '" width="' . (int)$width . '" style="display:block;border:0;outline:none;text-decoration:none;max-width:' . (int)$width . 'px;height:auto;">';
    }
}
