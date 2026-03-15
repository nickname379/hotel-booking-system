<?php
date_default_timezone_set('Asia/Ulaanbaatar');

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
require_once __DIR__.'/../vendor/autoload.php';
define('DB_HOST', 'localhost:3307');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'hotel_system');

define('SMTP_HOST', 'smtp.gmail.com');
define('SMTP_PORT', 587);
define('SMTP_USER', 'bayartsaihannarangerel@gmail.com');      // ← Өөрийн Gmail
define('SMTP_PASS', 'qdvxrgopxrvcirwi');        // ← App Password (16 тэмдэгт)
define('SMTP_FROM_NAME', 'МонголHotels Захиалга');

// ── QPAY ТОХИРГОО ────────────────────────────────────────────────
// QPay Merchant дансны мэдээлэл (QPay.mn-д бүртгүүлнэ)
define('QPAY_ENV', 'sandbox');  // 'sandbox' эсвэл 'production'
define('QPAY_USERNAME', 'TEST_MERCHANT');
define('QPAY_PASSWORD', 'TEST_MERCHANT');
define('QPAY_INVOICE_CODE', 'TEST_INVOICE');
define('QPAY_BASE_URL', 'https://merchant.qpay.mn/v2');
// Production: 'https://merchant.qpay.mn/v2'

// ── APP ──────────────────────────────────────────────────────────
define('APP_NAME', 'МонголHotels');
define('BASE_URL', 'http://localhost/hotel-v2');
define('OTP_EXPIRE_MINUTES', 10);
define('OTP_MAX_ATTEMPTS', 5);

// ── SESSION & ERROR ───────────────────────────────────────────────
if (session_status() === PHP_SESSION_NONE) session_start();
error_reporting(E_ALL);
ini_set('display_errors', 1);
error_reporting(E_ALL);
ini_set('log_errors', 1);

// ── DB CONNECTION ─────────────────────────────────────────────────
function getDB(): PDO {
    static $pdo = null;
    if (!$pdo) {
        $dsn = "mysql:host=".DB_HOST.";dbname=".DB_NAME.";charset=utf8mb4";
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

// ── HELPERS ──────────────────────────────────────────────────────
function sanitize(string $s): string {
    return htmlspecialchars(strip_tags(trim($s)), ENT_QUOTES, 'UTF-8');
}
function generateCode(int $len = 8): string {
    return strtoupper(substr(bin2hex(random_bytes($len)), 0, $len));
}
function generateOTP(): string {
    return str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}
function formatPrice(float $n): string {
    return number_format($n, 0, '.', ',') . '₮';
}
function isLoggedIn(): bool   { return !empty($_SESSION['guest_id']); }
function isAdminLoggedIn(): bool { return !empty($_SESSION['admin_id']); }
function jsonResponse(mixed $data, int $code = 200): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function getBody(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? $_POST;
}


class QPay {
    private static ?string $token = null;

    private static function request(string $method, string $endpoint, array $data = [], bool $auth = true): array {
        $url = QPAY_BASE_URL . $endpoint;
        $ch  = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_CUSTOMREQUEST  => $method,
        ]);

        $headers = ['Content-Type: application/json'];
        if ($auth && self::$token) {
            $headers[] = 'Authorization: Bearer ' . self::$token;
        } else if (!$auth) {
            $headers[] = 'Authorization: Basic ' . base64_encode(QPAY_USERNAME . ':' . QPAY_PASSWORD);
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        if (!empty($data)) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }

        $res  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $decoded = json_decode($res, true) ?? [];
        $decoded['_http_code'] = $code;
        return $decoded;
    }

    public static function getToken(): bool {
        $res = self::request('POST', '/auth/token', [], false);
        if (!empty($res['access_token'])) {
            self::$token = $res['access_token'];
            return true;
        }
        return false;
    }

    public static function createInvoice(array $booking): array {
        if (!self::getToken()) {
            return ['success' => false, 'error' => 'QPay холболт амжилтгүй'];
        }

        $payload = [
            'invoice_code'         => QPAY_INVOICE_CODE,
            'sender_invoice_no'    => $booking['booking_code'],
            'invoice_receiver_code'=> 'terminal',
            'invoice_description'  => "Зочид буудлын захиалга: " . $booking['booking_code'],
            'amount'               => (int)$booking['total_price'],
            'callback_url'         => BASE_URL . "/php/qpay_callback.php?booking=" . $booking['booking_code'],
        ];

        $res = self::request('POST', '/invoice', $payload);

        if (!empty($res['invoice_id'])) {
            return [
                'success'    => true,
                'invoice_id' => $res['invoice_id'],
                'qr_text'    => $res['qr_text'] ?? '',
                'qr_image'   => $res['qr_image'] ?? '',
                'urls'       => $res['urls'] ?? [],
            ];
        }
        return ['success' => false, 'error' => $res['message'] ?? 'QPay алдаа'];
    }

    public static function checkPayment(string $invoiceId): array {
        if (!self::getToken()) return ['paid' => false];
        $res = self::request('GET', '/payment/check/' . $invoiceId);
        $paid = !empty($res['rows']) && ($res['rows'][0]['payment_status'] ?? '') === 'PAID';
        return ['paid' => $paid, 'data' => $res];
    }
}
?>