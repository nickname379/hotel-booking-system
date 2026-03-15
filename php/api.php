<?php
if (session_status() === PHP_SESSION_NONE) session_start();

require_once __DIR__ . '/config.php';

// Try to load mail service
$mailServicePath = __DIR__ . '/../mail_service.php';
if (file_exists($mailServicePath)) {
    require_once $mailServicePath;
} else {
    function sendOTPEmail($email, $name, $otp, $type = 'register'): bool { return false; }
}

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$action = $_REQUEST['action'] ?? '';
$body   = getBody();

switch ($action) {
    // AUTH
    case 'send_otp':        sendOTP($body);      break;
    case 'verify_otp':      verifyOTP($body);    break;
    case 'register':        registerGuest($body); break;
    case 'login':           loginGuest($body);   break;
    case 'logout':          logoutGuest();       break;
    case 'get_session':     getSession();        break;

    // HOTELS
    case 'get_hotels':      getHotels();         break;
    case 'get_hotel':       getHotel();          break;
    case 'search_rooms':    searchRooms();       break;
    case 'get_room_types':  getRoomTypes();      break;
    case 'get_services':    getServices();       break;

    // BOOKINGS
    case 'create_booking':  createBooking($body); break;
    case 'my_bookings':     myBookings();        break;
    case 'check_booking':   checkBooking();      break;
    case 'cancel_booking':  cancelBooking($body); break;
    case 'check_promo':     checkPromo($body);   break;

    // PAYMENTS
    case 'init_payment':    initPayment($body);  break;
    case 'check_payment':   checkPayment();      break;
    case 'confirm_payment': confirmPayment($body); break;

    // REVIEWS
    case 'submit_review':   submitReview($body); break;
    case 'get_reviews':     getReviews();        break;

    default: jsonResponse(['error' => 'Буруу хүсэлт'], 400);
}

// ══════════════════════════════════════════════════════════════════
// HOTELS
// ══════════════════════════════════════════════════════════════════
function getHotels(): never {
    $db   = getDB();
    $city = sanitize($_GET['city'] ?? '');
    $feat = $_GET['featured'] ?? '';

    $sql = "SELECT h.*,
            (SELECT MIN(rt.base_price) FROM room_types rt WHERE rt.hotel_id=h.id AND rt.is_active=1) as min_price,
            (SELECT COUNT(*) FROM rooms r WHERE r.hotel_id=h.id AND r.status='available') as available_rooms
            FROM hotels h WHERE h.is_active=1";
    $params = [];
    if ($city) { $sql .= " AND h.city LIKE ?"; $params[] = "%$city%"; }
    if ($feat)  $sql .= " AND h.is_featured=1";
    $sql .= " ORDER BY h.is_featured DESC, h.stars DESC, h.rating DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $hotels = $stmt->fetchAll();

    foreach ($hotels as &$h) {
        $h['amenities'] = json_decode($h['amenities'] ?? '[]', true) ?: [];
        $h['gallery']   = json_decode($h['gallery']   ?? '[]', true) ?: [];
        $h['pros']      = json_decode($h['pros']      ?? '[]', true) ?: [];
        $h['cons']      = json_decode($h['cons']      ?? '[]', true) ?: [];
    }
    jsonResponse(['hotels' => $hotels]);
}

function getHotel(): never {
    $db   = getDB();
    $id   = (int)($_GET['id'] ?? 0);
    $slug = sanitize($_GET['slug'] ?? '');
    $where = $id ? "h.id=?" : "h.slug=?";
    $param = $id ?: $slug;

    $stmt = $db->prepare("SELECT h.* FROM hotels h WHERE $where AND h.is_active=1");
    $stmt->execute([$param]);
    $hotel = $stmt->fetch();
    if (!$hotel) jsonResponse(['error' => 'Буудал олдсонгүй'], 404);

    foreach (['amenities','gallery','pros','cons','policies'] as $k) {
        $hotel[$k] = json_decode($hotel[$k] ?? '[]', true) ?: [];
    }

    // Room types with available count
    $stmt = $db->prepare("SELECT rt.*,
        (SELECT COUNT(*) FROM rooms r WHERE r.hotel_id=rt.hotel_id AND r.room_type_id=rt.id AND r.status='available') as available_count
        FROM room_types rt WHERE rt.hotel_id=? AND rt.is_active=1 ORDER BY rt.base_price");
    $stmt->execute([$hotel['id']]);
    $types = $stmt->fetchAll();
    foreach ($types as &$t) {
        $t['amenities'] = json_decode($t['amenities'] ?? '[]', true) ?: [];
        $t['images']    = json_decode($t['images']    ?? '[]', true) ?: [];
        $t['pros']      = json_decode($t['pros']      ?? '[]', true) ?: [];
        $t['cons']      = json_decode($t['cons']      ?? '[]', true) ?: [];
    }
    $hotel['room_types'] = $types;

    // Reviews
    $stmt = $db->prepare("SELECT r.*, g.first_name, g.last_name FROM reviews r
                           JOIN guests g ON r.guest_id=g.id
                           WHERE r.hotel_id=? AND r.is_published=1
                           ORDER BY r.created_at DESC LIMIT 6");
    $stmt->execute([$hotel['id']]);
    $hotel['reviews'] = $stmt->fetchAll();

    jsonResponse(['hotel' => $hotel]);
}

function searchRooms(): never {
    $db        = getDB();
    $hotel_id  = (int)($_GET['hotel_id'] ?? 0);
    $check_in  = sanitize($_GET['check_in']  ?? '');
    $check_out = sanitize($_GET['check_out'] ?? '');
    $adults    = max(1, (int)($_GET['adults'] ?? 1));
    $children  = max(0, (int)($_GET['children'] ?? 0));

    if (!$hotel_id || !$check_in || !$check_out) jsonResponse(['error' => 'Параметр дутуу'], 400);

    $nights = max(1, (strtotime($check_out) - strtotime($check_in)) / 86400);
    $total_guests = $adults + $children;

    $stmt = $db->prepare("SELECT rt.*,
        COUNT(r.id) as total_rooms,
        SUM(CASE WHEN r.status='available' AND r.id NOT IN (
            SELECT b.room_id FROM bookings b
            WHERE b.status NOT IN ('cancelled','checked_out')
            AND NOT (b.check_out <= ? OR b.check_in >= ?)
            AND b.room_id IS NOT NULL
        ) THEN 1 ELSE 0 END) as available_count
        FROM room_types rt
        JOIN rooms r ON r.room_type_id=rt.id AND r.hotel_id=?
        WHERE rt.hotel_id=? AND rt.is_active=1 AND rt.max_guests >= ?
        GROUP BY rt.id
        HAVING available_count > 0
        ORDER BY rt.base_price");
    $stmt->execute([$check_in, $check_out, $hotel_id, $hotel_id, $total_guests]);
    $types = $stmt->fetchAll();

    foreach ($types as &$t) {
        $t['amenities']   = json_decode($t['amenities'] ?? '[]', true) ?: [];
        $t['images']      = json_decode($t['images']    ?? '[]', true) ?: [];
        $t['pros']        = json_decode($t['pros']      ?? '[]', true) ?: [];
        $t['cons']        = json_decode($t['cons']      ?? '[]', true) ?: [];
        $t['nights']      = $nights;
        $t['total_price'] = $t['base_price'] * $nights;
    }

    jsonResponse(['room_types' => $types, 'nights' => $nights]);
}

function getRoomTypes(): never {
    $db = getDB();
    $hotel_id = (int)($_GET['hotel_id'] ?? 0);
    if (!$hotel_id) jsonResponse(['error' => 'hotel_id шаардлагатай'], 400);

    $stmt = $db->prepare("SELECT rt.*,
        (SELECT COUNT(*) FROM rooms r WHERE r.hotel_id=rt.hotel_id AND r.room_type_id=rt.id AND r.status='available') as available_count
        FROM room_types rt WHERE rt.hotel_id=? AND rt.is_active=1 ORDER BY rt.base_price");
    $stmt->execute([$hotel_id]);
    $types = $stmt->fetchAll();
    foreach ($types as &$t) {
        $t['amenities'] = json_decode($t['amenities'] ?? '[]', true) ?: [];
        $t['images']    = json_decode($t['images']    ?? '[]', true) ?: [];
        $t['pros']      = json_decode($t['pros']      ?? '[]', true) ?: [];
        $t['cons']      = json_decode($t['cons']      ?? '[]', true) ?: [];
    }
    jsonResponse(['room_types' => $types]);
}

function getServices(): never {
    $db = getDB();
    $hotel_id = (int)($_GET['hotel_id'] ?? 0);
    $stmt = $db->prepare("SELECT * FROM services WHERE (hotel_id IS NULL OR hotel_id=?) AND is_active=1 ORDER BY category, name");
    $stmt->execute([$hotel_id]);
    jsonResponse(['services' => $stmt->fetchAll()]);
}

// ══════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════
function sendOTP(array $body): never {
    $email = filter_var($body['email'] ?? '', FILTER_VALIDATE_EMAIL);
    $type  = in_array($body['type'] ?? 'register', ['register','login','reset','booking'])
             ? $body['type'] : 'register';
    $name  = sanitize($body['name'] ?? 'Хэрэглэгч');

    if (!$email) jsonResponse(['error' => 'Имэйл хаяг буруу байна'], 400);

    $db = getDB();

    // Rate limit
    $stmt = $db->prepare("SELECT COUNT(*) FROM otp_codes WHERE email=? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)");
    $stmt->execute([$email]);
    if ($stmt->fetchColumn() >= 30) jsonResponse(['error' => '1 цагт хамгийн ихдээ 30 код'], 429);

    if ($type === 'register') {
        $stmt = $db->prepare("SELECT id FROM guests WHERE email=?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) jsonResponse(['error' => 'Энэ имэйл бүртгэлтэй. Нэвтрэх хэсгийг ашиглана уу.'], 409);
    }
    if ($type === 'login') {
        $stmt = $db->prepare("SELECT first_name FROM guests WHERE email=?");
        $stmt->execute([$email]);
        $g = $stmt->fetch();
        if (!$g) jsonResponse(['error' => 'Имэйл хаяг бүртгэлгүй байна'], 404);
        $name = $g['first_name'];
    }

    $otp     = generateOTP();
    $expires = date('Y-m-d H:i:s', time() + OTP_EXPIRE_MINUTES * 60);

    $db->prepare("UPDATE otp_codes SET is_used=1 WHERE email=? AND type=? AND is_used=0")->execute([$email, $type]);
    $db->prepare("INSERT INTO otp_codes (email, code, type, expires_at) VALUES (?,?,?,?)")->execute([$email, $otp, $type, $expires]);

    $sent = sendOTPEmail($email, $name, $otp, $type);
    if (!$sent) {
        // Dev mode — return OTP in response
        jsonResponse(['success' => true, 'dev_otp' => $otp,
                      'message' => 'SMTP тохируулаагүй — Dev OTP код']);
    }

    jsonResponse(['success' => true, 'message' => "$email хаягт OTP илгээлээ"]);
}

function verifyOTP(array $body): never {
    $db    = getDB();
    $email = filter_var($body['email'] ?? '', FILTER_VALIDATE_EMAIL);
    $code  = sanitize($body['code'] ?? '');
    $type  = sanitize($body['type'] ?? 'register');

    $stmt = $db->prepare("SELECT * FROM otp_codes WHERE email=? AND code=? AND type=? AND is_used=0 AND expires_at > NOW() LIMIT 1");
    $stmt->execute([$email, $code, $type]);
    $otp = $stmt->fetch();

    if (!$otp) jsonResponse(['error' => 'OTP буруу эсвэл хугацаа дууссан'], 400);

    $db->prepare("UPDATE otp_codes SET is_used=1 WHERE id=?")->execute([$otp['id']]);
    $_SESSION['otp_verified_email'] = $email;

    jsonResponse(['success' => true]);
}

function registerGuest(array $body): never {
    $email = filter_var($body['email'] ?? '', FILTER_VALIDATE_EMAIL);
    $first = sanitize($body['first_name'] ?? '');
    $last  = sanitize($body['last_name']  ?? '');
    $phone = sanitize($body['phone']      ?? '');
    $pass  = $body['password'] ?? '';

    if (!$email || !$first || !$last) jsonResponse(['error' => 'Мэдээлэл дутуу'], 400);

    if (empty($_SESSION['otp_verified_email']) || $_SESSION['otp_verified_email'] !== $email) {
        jsonResponse(['error' => 'OTP баталгаажуулалт хийгдээгүй байна'], 400);
    }

    $db = getDB();
    $stmt = $db->prepare("SELECT id FROM guests WHERE email=?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) jsonResponse(['error' => 'Энэ имэйл бүртгэлтэй байна'], 409);

    $hash = $pass ? password_hash($pass, PASSWORD_DEFAULT) : password_hash(bin2hex(random_bytes(8)), PASSWORD_DEFAULT);
    $db->prepare("INSERT INTO guests (first_name,last_name,email,phone,password_hash,is_verified) VALUES (?,?,?,?,?,1)")
       ->execute([$first, $last, $email, $phone, $hash]);
    $id = $db->lastInsertId();

    $_SESSION['guest_id']    = $id;
    $_SESSION['guest_email'] = $email;
    $_SESSION['guest_name']  = "$first $last";
    unset($_SESSION['otp_verified_email']);

    jsonResponse(['success' => true, 'name' => "$first $last", 'email' => $email]);
}

function loginGuest(array $body): never {
    $email    = filter_var($body['email'] ?? '', FILTER_VALIDATE_EMAIL);
    $code     = sanitize($body['code']     ?? $body['otp_code'] ?? '');
    $password = $body['password'] ?? '';

    if (!$email) jsonResponse(['error' => 'Имэйл хаяг буруу'], 400);

    $db   = getDB();
    $stmt = $db->prepare("SELECT * FROM guests WHERE email=?");
    $stmt->execute([$email]);
    $guest = $stmt->fetch();
    if (!$guest) jsonResponse(['error' => 'Имэйл хаяг бүртгэлгүй байна'], 404);

    // OTP login
    if ($code) {
        $stmt = $db->prepare("SELECT id FROM otp_codes WHERE email=? AND code=? AND type='login' AND is_used=0 AND expires_at > NOW() LIMIT 1");
        $stmt->execute([$email, $code]);
        $otp = $stmt->fetch();
        if (!$otp) jsonResponse(['error' => 'OTP код буруу эсвэл хугацаа дуусчээ'], 400);
        $db->prepare("UPDATE otp_codes SET is_used=1 WHERE id=?")->execute([$otp['id']]);
    } elseif ($password) {
        // Password login (demo: accept 'password' universally)
        if (!password_verify($password, $guest['password_hash']) && $password !== 'password') {
            jsonResponse(['error' => 'Нууц үг буруу байна'], 401);
        }
    } else {
        jsonResponse(['error' => 'OTP код эсвэл нууц үг оруулна уу'], 400);
    }

    $db->prepare("UPDATE guests SET last_login=NOW() WHERE id=?")->execute([$guest['id']]);
    $_SESSION['guest_id']    = $guest['id'];
    $_SESSION['guest_name']  = $guest['first_name'] . ' ' . $guest['last_name'];
    $_SESSION['guest_email'] = $guest['email'];

    jsonResponse(['success' => true, 'name' => $_SESSION['guest_name'],
                  'email' => $guest['email'], 'is_vip' => $guest['is_vip'],
                  'loyalty_points' => $guest['loyalty_points']]);
}

function logoutGuest(): never { session_destroy(); jsonResponse(['success' => true]); }

function getSession(): never {
    if (isLoggedIn()) {
        $db   = getDB();
        $stmt = $db->prepare("SELECT id,first_name,last_name,email,is_vip,loyalty_points,total_stays FROM guests WHERE id=?");
        $stmt->execute([$_SESSION['guest_id']]);
        jsonResponse(['logged_in' => true, 'guest' => $stmt->fetch()]);
    }
    jsonResponse(['logged_in' => false]);
}

// ══════════════════════════════════════════════════════════════════
// BOOKINGS
// ══════════════════════════════════════════════════════════════════
function createBooking(array $body): never {
    if (!isLoggedIn()) jsonResponse(['error' => 'Нэвтрэч орно уу', 'need_auth' => true], 401);

    $db           = getDB();
    $hotel_id     = (int)($body['hotel_id']     ?? 0);
    $room_type_id = (int)($body['room_type_id'] ?? 0);
    $check_in     = sanitize($body['check_in']  ?? '');
    $check_out    = sanitize($body['check_out'] ?? '');
    $adults       = max(1, (int)($body['adults']   ?? 1));
    $children     = max(0, (int)($body['children'] ?? 0));
    $special      = sanitize($body['special_requests'] ?? '');
    $promo_code   = strtoupper(sanitize($body['promo_code'] ?? ''));
    $services     = (array)($body['services'] ?? []);

    if (!$hotel_id || !$room_type_id || !$check_in || !$check_out) {
        jsonResponse(['error' => 'Шаардлагатай мэдээлэл дутуу'], 400);
    }
    $nights = (strtotime($check_out) - strtotime($check_in)) / 86400;
    if ($nights < 1) jsonResponse(['error' => 'Хамгийн багадаа 1 хоног байх ёстой'], 400);

    // Find available room
    $stmt = $db->prepare("SELECT r.* FROM rooms r
                           WHERE r.hotel_id=? AND r.room_type_id=? AND r.status='available'
                           AND r.id NOT IN (
                               SELECT b.room_id FROM bookings b
                               WHERE b.status NOT IN ('cancelled','checked_out')
                               AND b.room_id IS NOT NULL
                               AND NOT (b.check_out <= ? OR b.check_in >= ?)
                           ) LIMIT 1");
    $stmt->execute([$hotel_id, $room_type_id, $check_in, $check_out]);
    $room = $stmt->fetch();
    if (!$room) jsonResponse(['error' => 'Тухайн хугацаанд боломжтой өрөо байхгүй байна'], 409);

    // Price calculation
    $stmt = $db->prepare("SELECT base_price FROM room_types WHERE id=?");
    $stmt->execute([$room_type_id]);
    $rtype = $stmt->fetch();
    $room_total = $rtype['base_price'] * $nights;

    // Promo
    $discount = 0;
    if ($promo_code) {
        $stmt = $db->prepare("SELECT * FROM promo_codes WHERE code=? AND is_active=1
                               AND (hotel_id IS NULL OR hotel_id=?)
                               AND (valid_until IS NULL OR valid_until >= CURDATE())
                               AND min_nights <= ? AND min_amount <= ?
                               AND (max_uses IS NULL OR used_count < max_uses)");
        $stmt->execute([$promo_code, $hotel_id, $nights, $room_total]);
        $promo = $stmt->fetch();
        if ($promo) {
            $discount = $promo['discount_type'] === 'percent'
                ? $room_total * $promo['discount_value'] / 100
                : $promo['discount_value'];
        }
    }

    // Services
    $svc_total = 0;
    $svc_items = [];
    if ($services) {
        $svc_ids = array_filter(array_map(fn($s) => is_array($s) ? (int)($s['id'] ?? 0) : (int)$s, $services));
        if ($svc_ids) {
            $ph = implode(',', array_fill(0, count($svc_ids), '?'));
            $stmt = $db->prepare("SELECT * FROM services WHERE id IN ($ph) AND is_active=1");
            $stmt->execute(array_values($svc_ids));
            $svc_items = $stmt->fetchAll();
            foreach ($svc_items as $s) $svc_total += $s['price'];
        }
    }

    $tax   = ($room_total - $discount + $svc_total) * 0.10;
    $total = $room_total - $discount + $svc_total + $tax;
    $code  = 'MH' . date('ymd') . generateCode(5);

    $db->beginTransaction();
    try {
        $stmt = $db->prepare("INSERT INTO bookings
            (booking_code,hotel_id,guest_id,room_id,check_in,check_out,num_adults,num_children,
             room_price,services_total,discount_amount,tax_amount,total_price,special_requests)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
        $stmt->execute([$code, $hotel_id, $_SESSION['guest_id'], $room['id'], $check_in, $check_out,
                        $adults, $children, $room_total, $svc_total, $discount, $tax, $total, $special]);
        $bid = $db->lastInsertId();

        foreach ($svc_items as $s) {
            $db->prepare("INSERT INTO booking_services (booking_id,service_id,quantity,unit_price) VALUES (?,?,1,?)")
               ->execute([$bid, $s['id'], $s['price']]);
        }

        if ($promo_code && !empty($promo)) {
            $db->prepare("UPDATE promo_codes SET used_count=used_count+1 WHERE code=?")->execute([$promo_code]);
        }

        $db->prepare("UPDATE guests SET total_stays=total_stays+1, total_spent=total_spent+?,
                       loyalty_points=loyalty_points+? WHERE id=?")
           ->execute([$total, (int)($total / 1000), $_SESSION['guest_id']]);

        $db->commit();
        jsonResponse(['success' => true, 'booking_id' => $bid, 'booking_code' => $code,
                      'total_price' => $total, 'breakdown' => compact('room_total','discount','svc_total','tax','total')]);
    } catch (\Throwable $e) {
        $db->rollBack();
        error_log($e->getMessage());
        jsonResponse(['error' => 'Захиалга үүсгэхэд алдаа гарлаа'], 500);
    }
}

function myBookings(): never {
    if (!isLoggedIn()) jsonResponse(['error' => 'Нэвтрэч орно уу', 'need_auth' => true], 401);
    $db   = getDB();
    $stmt = $db->prepare("SELECT b.*, h.name as hotel_name, h.cover_image,
                                   COALESCE(r.room_number,'—') as room_number,
                                   rt.name as room_type_name,
                                   p.status as payment_status, p.payment_method
                           FROM bookings b
                           JOIN hotels h    ON b.hotel_id=h.id
                           LEFT JOIN rooms r ON b.room_id=r.id
                           LEFT JOIN room_types rt ON r.room_type_id=rt.id
                           LEFT JOIN payments p ON p.booking_id=b.id AND p.status='completed'
                           WHERE b.guest_id=? ORDER BY b.created_at DESC");
    $stmt->execute([$_SESSION['guest_id']]);
    jsonResponse(['bookings' => $stmt->fetchAll()]);
}

function checkBooking(): never {
    $code = strtoupper(sanitize($_GET['code'] ?? ''));
    if (!$code) jsonResponse(['error' => 'Захиалгын код оруулна уу'], 400);
    $db   = getDB();
    $stmt = $db->prepare("SELECT b.*, h.name as hotel_name, h.address, h.phone,
                                   COALESCE(r.room_number,'—') as room_number,
                                   rt.name as room_type_name,
                                   g.first_name, g.last_name, g.email
                           FROM bookings b
                           JOIN hotels h ON b.hotel_id=h.id
                           LEFT JOIN rooms r ON b.room_id=r.id
                           LEFT JOIN room_types rt ON r.room_type_id=rt.id
                           JOIN guests g ON b.guest_id=g.id
                           WHERE b.booking_code=?");
    $stmt->execute([$code]);
    $bk = $stmt->fetch();
    if (!$bk) jsonResponse(['error' => 'Захиалга олдсонгүй'], 404);
    jsonResponse(['booking' => $bk]);
}

function cancelBooking(array $body): never {
    if (!isLoggedIn()) jsonResponse(['error' => 'Нэвтрэч орно уу'], 401);
    $db = getDB();
    $id = (int)($body['booking_id'] ?? 0);
    $stmt = $db->prepare("UPDATE bookings SET status='cancelled', cancelled_at=NOW()
                           WHERE id=? AND guest_id=? AND status IN ('pending','confirmed')");
    $stmt->execute([$id, $_SESSION['guest_id']]);
    if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Захиалгыг цуцлах боломжгүй'], 400);
    jsonResponse(['success' => true]);
}

function checkPromo(array $body): never {
    $db       = getDB();
    $code     = strtoupper(sanitize($body['code'] ?? ''));
    $hotel_id = (int)($body['hotel_id'] ?? 0);
    $nights   = (int)($body['nights']   ?? 1);
    $amount   = (float)($body['amount'] ?? 0);

    $stmt = $db->prepare("SELECT * FROM promo_codes WHERE code=? AND is_active=1
                           AND (hotel_id IS NULL OR hotel_id=?)
                           AND (valid_until IS NULL OR valid_until >= CURDATE())
                           AND min_nights <= ? AND min_amount <= ?
                           AND (max_uses IS NULL OR used_count < max_uses)");
    $stmt->execute([$code, $hotel_id, $nights, $amount]);
    $promo = $stmt->fetch();

    if (!$promo) jsonResponse(['valid' => false, 'error' => 'Купон код хүчингүй эсвэл хугацаа дуусчээ']);

    $discount = $promo['discount_type'] === 'percent'
        ? $amount * $promo['discount_value'] / 100
        : $promo['discount_value'];

    jsonResponse(['valid' => true, 'discount' => $discount, 'type' => $promo['discount_type'],
                  'value' => $promo['discount_value'],
                  'label' => $promo['discount_type'] === 'percent'
                             ? $promo['discount_value'] . '% хөнгөлөлт'
                             : formatPrice($promo['discount_value']) . ' хөнгөлөлт']);
}

// ══════════════════════════════════════════════════════════════════
// PAYMENTS
// ══════════════════════════════════════════════════════════════════
function initPayment(array $body): never {
    $db         = getDB();
    $booking_id = (int)($body['booking_id'] ?? 0);
    $method     = sanitize($body['method']     ?? '');

    $allowed = ['qpay','socialpay','monpay','khanbank','golomtbank','tdbbank','cash','card','transfer'];
    if (!in_array($method, $allowed)) jsonResponse(['error' => 'Төлбөрийн хэлбэр буруу'], 400);
    if (!$booking_id) jsonResponse(['error' => 'booking_id байхгүй'], 400);

    $stmt = $db->prepare("SELECT b.*, h.name as hotel_name FROM bookings b
                           JOIN hotels h ON b.hotel_id=h.id WHERE b.id=?");
    $stmt->execute([$booking_id]);
    $booking = $stmt->fetch();
    if (!$booking) jsonResponse(['error' => 'Захиалга олдсонгүй'], 404);

    $db->prepare("INSERT INTO payments (booking_id,payment_method,amount,status) VALUES (?,?,?,'pending')")
       ->execute([$booking_id, $method, $booking['total_price']]);
    $payment_id = $db->lastInsertId();

    $amt = $booking['total_price'];

    if ($method === 'qpay') {
        $qpay = QPay::createInvoice($booking);
        if ($qpay['success']) {
            $db->prepare("UPDATE payments SET qpay_invoice_id=?,qpay_qr_text=?,status='processing' WHERE id=?")
               ->execute([$qpay['invoice_id'], $qpay['qr_text'], $payment_id]);
            jsonResponse(['success' => true, 'payment_id' => $payment_id, 'method' => 'qpay',
                          'amount' => $amt, 'qr_text' => $qpay['qr_text'],
                          'deep_links' => makeDeepLinks($qpay['qr_text'], $booking)]);
        }
        // Sandbox fallback
        $qrTxt = 'QPay_' . $booking['booking_code'];
        $db->prepare("UPDATE payments SET qpay_qr_text=?,status='processing',gateway_ref='SANDBOX' WHERE id=?")
           ->execute([$qrTxt, $payment_id]);
        jsonResponse(['success' => true, 'payment_id' => $payment_id, 'method' => 'qpay',
                      'amount' => $amt, 'qr_text' => $qrTxt, 'sandbox' => true,
                      'deep_links' => makeDeepLinks($qrTxt, $booking)]);
    }

    if (in_array($method, ['khanbank','golomtbank','tdbbank'])) {
        $db->prepare("UPDATE payments SET status='processing' WHERE id=?")->execute([$payment_id]);
        jsonResponse(['success' => true, 'payment_id' => $payment_id, 'method' => $method,
                      'amount' => $amt, 'bank_info' => getBankInfo($method, $booking)]);
    }

    if (in_array($method, ['socialpay','monpay'])) {
        $db->prepare("UPDATE payments SET status='processing' WHERE id=?")->execute([$payment_id]);
        jsonResponse(['success' => true, 'payment_id' => $payment_id, 'method' => $method,
                      'amount' => $amt, 'merchant_name' => 'MONGOHOTELS']);
    }

    // Cash / Card
    jsonResponse(['success' => true, 'payment_id' => $payment_id, 'method' => $method, 'amount' => $amt]);
}

function checkPayment(): never {
    $db         = getDB();
    $payment_id = (int)($_GET['payment_id'] ?? 0);
    if (!$payment_id) jsonResponse(['error' => 'payment_id шаардлагатай'], 400);

    $stmt = $db->prepare("SELECT * FROM payments WHERE id=?");
    $stmt->execute([$payment_id]);
    $p = $stmt->fetch();
    if (!$p) jsonResponse(['error' => 'Төлбөр олдсонгүй'], 404);

    // If QPay, check with API
    if ($p['payment_method'] === 'qpay' && $p['qpay_invoice_id']) {
        $result = QPay::checkPayment($p['qpay_invoice_id']);
        if ($result['paid']) {
            $db->prepare("UPDATE payments SET status='completed',paid_at=NOW() WHERE id=?")->execute([$payment_id]);
            $db->prepare("UPDATE bookings SET status='confirmed' WHERE id=?")->execute([$p['booking_id']]);
            jsonResponse(['paid' => true, 'status' => 'completed']);
        }
    }

    jsonResponse(['paid' => $p['status'] === 'completed', 'status' => $p['status']]);
}

function confirmPayment(array $body): never {
    $db         = getDB();
    $payment_id = (int)($body['payment_id'] ?? 0);
    $ref        = sanitize($body['reference'] ?? 'MANUAL');

    $stmt = $db->prepare("UPDATE payments SET status='completed', transaction_id=?, paid_at=NOW() WHERE id=?");
    $stmt->execute([$ref, $payment_id]);

    $stmt = $db->prepare("SELECT booking_id FROM payments WHERE id=?");
    $stmt->execute([$payment_id]);
    $p = $stmt->fetch();
    if ($p) $db->prepare("UPDATE bookings SET status='confirmed' WHERE id=?")->execute([$p['booking_id']]);

    jsonResponse(['success' => true]);
}

function makeDeepLinks(string $qr, array $booking): array {
    $e = urlencode($qr);
    return [
        ['name' => 'Хаан Банк',    'logo' => '🏦', 'url' => "khanbank://q?qPay_QRcode=$e"],
        ['name' => 'Голомт Банк',  'logo' => '🏛', 'url' => "golomtbank://q?qPay_QRcode=$e"],
        ['name' => 'ТДБ Банк',     'logo' => '🏢', 'url' => "tdbbank://q?qPay_QRcode=$e"],
        ['name' => 'Хас Банк',     'logo' => '🌟', 'url' => "xacbank://q?qPay_QRcode=$e"],
        ['name' => 'Капитрон',     'logo' => '💠', 'url' => "capitronbank://q?qPay_QRcode=$e"],
        ['name' => 'Most Money',   'logo' => '📱', 'url' => "mostmoney://q?qPay_QRcode=$e"],
    ];
}

function getBankInfo(string $bank, array $booking): array {
    $banks = [
        'khanbank'   => ['name' => 'Хаан Банк',   'account' => '5000123456'],
        'golomtbank' => ['name' => 'Голомт Банк',  'account' => '1200987654'],
        'tdbbank'    => ['name' => 'ТДБ Банк',     'account' => '4001234567'],
    ];
    $info = $banks[$bank] ?? $banks['khanbank'];
    return array_merge($info, ['owner' => 'МонголHotels ХХК',
                                'reference' => $booking['booking_code'],
                                'amount' => $booking['total_price']]);
}

// ══════════════════════════════════════════════════════════════════
// REVIEWS
// ══════════════════════════════════════════════════════════════════
function submitReview(array $body): never {
    if (!isLoggedIn()) jsonResponse(['error' => 'Нэвтрэч орно уу'], 401);
    $db         = getDB();
    $booking_id = (int)($body['booking_id'] ?? 0);
    $overall    = max(1, min(5, (int)($body['overall']      ?? 5)));
    $clean      = max(1, min(5, (int)($body['cleanliness']  ?? 5)));
    $service    = max(1, min(5, (int)($body['service']      ?? 5)));
    $location   = max(1, min(5, (int)($body['location']     ?? 5)));
    $comment    = sanitize($body['comment'] ?? '');

    // Check booking exists (relaxed check for demo — allow any booking)
    $stmt = $db->prepare("SELECT hotel_id FROM bookings WHERE id=? AND guest_id=?");
    $stmt->execute([$booking_id, $_SESSION['guest_id']]);
    $bk = $stmt->fetch();
    if (!$bk) jsonResponse(['error' => 'Захиалга олдсонгүй'], 400);

    $db->prepare("INSERT INTO reviews (booking_id,hotel_id,guest_id,overall_rating,cleanliness_rating,service_rating,location_rating,comment)
                  VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE overall_rating=VALUES(overall_rating),comment=VALUES(comment)")
       ->execute([$booking_id, $bk['hotel_id'], $_SESSION['guest_id'], $overall, $clean, $service, $location, $comment]);

    $db->prepare("UPDATE hotels SET rating=(SELECT AVG(overall_rating) FROM reviews WHERE hotel_id=? AND is_published=1),
                   total_reviews=(SELECT COUNT(*) FROM reviews WHERE hotel_id=? AND is_published=1) WHERE id=?")
       ->execute([$bk['hotel_id'], $bk['hotel_id'], $bk['hotel_id']]);

    jsonResponse(['success' => true]);
}

function getReviews(): never {
    $db       = getDB();
    $hotel_id = (int)($_GET['hotel_id'] ?? 0);
    $limit    = min(20, (int)($_GET['limit'] ?? 10));
    $stmt     = $db->prepare("SELECT r.*, g.first_name, g.last_name FROM reviews r
                               JOIN guests g ON r.guest_id=g.id
                               WHERE r.hotel_id=? AND r.is_published=1
                               ORDER BY r.created_at DESC LIMIT ?");
    $stmt->execute([$hotel_id, $limit]);
    jsonResponse(['reviews' => $stmt->fetchAll()]);
}