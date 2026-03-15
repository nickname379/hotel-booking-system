<?php
if(session_status()===PHP_SESSION_NONE){
session_start();
}

require_once __DIR__.'/config.php';
require_once __DIR__.'/../mail_service.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if($_SERVER['REQUEST_METHOD']==='OPTIONS'){
exit;
}

$action = $_REQUEST['action'] ?? '';

$body = getBody();

$input = json_decode(file_get_contents("php://input"), true);

if(!$input){
    $input = $_POST;
}
switch ($action){

// AUTH
case 'send_otp':
sendOTP($body);
break;

case 'verify_otp':
verifyOTP($body);
break;

case 'register':
registerGuest($body);
break;

case 'login':
loginGuest($body);
break;

case 'logout':
logoutGuest();
break;

case 'get_session':
getSession();
break;


// HOTELS
case 'get_hotels':
getHotels();
break;

case 'get_hotel':
getHotel();
break;

case 'search_rooms':
searchRooms();
break;

case 'get_room_types':
getRoomTypes();
break;

case 'get_services':
getServices();
break;


// BOOKINGS
case 'create_booking':

$data = json_decode(file_get_contents("php://input"), true);

$booking_code = "MH".date("ymd").strtoupper(substr(md5(rand()),0,5));

$status = "pending";   // 👈 төлбөр төлөөгүй

echo json_encode([
    "success"=>true,
    "booking_id"=>rand(10000,99999),
    "booking_code"=>$booking_code,
    "total_price"=>715000,
    "status"=>$status
]);

break;

case 'my_bookings':
myBookings();
break;

case 'check_booking':
checkBooking();
break;

case 'cancel_booking':
cancelBooking($body);
break;

case 'check_promo':
checkPromo($body);
break;


// PAYMENTS
case 'init_payment':

$input = json_decode(file_get_contents("php://input"), true);

$booking_id = intval($input['booking_id'] ?? 0);
$method     = $input['method'] ?? '';

if(!$booking_id){
 echo json_encode([
  "success"=>false,
  "error"=>"booking_id байхгүй"
 ]);
 exit;
}

$db = getDB();

$stmt = $db->prepare("
SELECT id,total_price,booking_code
FROM bookings
WHERE id=?
");

$stmt->execute([$booking_id]);
$booking = $stmt->fetch();

if(!$booking){
 echo json_encode([
  "success"=>false,
  "error"=>"Захиалга олдсонгүй"
 ]);
 exit;
}

$stmt = $db->prepare("
INSERT INTO payments
(booking_id,payment_method,amount,status)
VALUES (?,?,?,'pending')
");

$stmt->execute([
 $booking_id,
 $method,
 $booking['total_price']
]);

$payment_id = $db->lastInsertId();

echo json_encode([
 "success"=>true,
 "payment_id"=>$payment_id,
 "amount"=>$booking['total_price']
]);

break;

// REVIEWS
case 'submit_review':
submitReview($body);
break;

case 'get_reviews':
getReviews();
break;


default:
jsonResponse(['error'=>'Буруу хүсэлт'],400);

}

// ═══════════════════════════════════════════════════════════════
// HOTELS
// ═══════════════════════════════════════════════════════════════
function getHotels(): never {
    $db   = getDB();
    $city = sanitize($_GET['city'] ?? '');
    $feat = $_GET['featured'] ?? '';

    $sql  = "SELECT h.*, 
             (SELECT MIN(rt.base_price) FROM room_types rt WHERE rt.hotel_id=h.id AND rt.is_active=1) as min_price,
             (SELECT COUNT(*) FROM rooms r WHERE r.hotel_id=h.id AND r.status='available') as available_rooms
             FROM hotels h WHERE h.is_active=1";
    $params = [];

    if ($city) { $sql .= " AND h.city LIKE ?"; $params[] = "%$city%"; }
    if ($feat) { $sql .= " AND h.is_featured=1"; }
    $sql .= " ORDER BY h.is_featured DESC, h.rating DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $hotels = $stmt->fetchAll();

    foreach ($hotels as &$h) {
        $h['amenities'] = json_decode($h['amenities'] ?? '[]', true);
        $h['gallery']   = json_decode($h['gallery'] ?? '[]', true);
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

    $hotel['amenities'] = json_decode($hotel['amenities'] ?? '[]', true);
    $hotel['gallery']   = json_decode($hotel['gallery'] ?? '[]', true);
    $hotel['policies']  = json_decode($hotel['policies'] ?? '{}', true);

    // Room types
    $stmt = $db->prepare("SELECT * FROM room_types WHERE hotel_id=? AND is_active=1 ORDER BY base_price");
    $stmt->execute([$hotel['id']]);
    $types = $stmt->fetchAll();
    foreach ($types as &$t) {
        $t['amenities'] = json_decode($t['amenities'] ?? '[]', true);
        $t['images']    = json_decode($t['images'] ?? '[]', true);
    }
    $hotel['room_types'] = $types;

    // Reviews
    $stmt = $db->prepare("SELECT r.*, g.first_name, g.last_name FROM reviews r 
                           JOIN guests g ON r.guest_id=g.id WHERE r.hotel_id=? AND r.is_published=1 
                           ORDER BY r.created_at DESC LIMIT 6");
    $stmt->execute([$hotel['id']]);
    $hotel['reviews'] = $stmt->fetchAll();

    jsonResponse(['hotel' => $hotel]);
}

function searchRooms(): never {
    $db       = getDB();
    $hotel_id = (int)($_GET['hotel_id'] ?? 0);
    $check_in = $_GET['check_in'] ?? '';
    $check_out= $_GET['check_out'] ?? '';
    $adults   = max(1, (int)($_GET['adults'] ?? 1));
    $children = max(0, (int)($_GET['children'] ?? 0));

    if (!$hotel_id || !$check_in || !$check_out) {
        jsonResponse(['error' => 'Шаардлагатай параметр дутуу'], 400);
    }

    $nights = max(1, (strtotime($check_out) - strtotime($check_in)) / 86400);
    $total_guests = $adults + $children;

    $stmt = $db->prepare("SELECT rt.*, 
        COUNT(r.id) as total_rooms,
        COUNT(r.id) - COUNT(b.id) as available_count
        FROM room_types rt
        JOIN rooms r ON r.room_type_id=rt.id AND r.hotel_id=? AND r.status='available'
        LEFT JOIN bookings b ON b.room_id=r.id 
            AND b.status NOT IN ('cancelled','checked_out')
            AND NOT (b.check_out <= ? OR b.check_in >= ?)
        WHERE rt.hotel_id=? AND rt.is_active=1 AND rt.max_guests >= ?
        GROUP BY rt.id
        HAVING available_count > 0
        ORDER BY rt.base_price");
    $stmt->execute([$hotel_id, $check_in, $check_out, $hotel_id, $total_guests]);
    $types = $stmt->fetchAll();

    foreach ($types as &$t) {
        $t['amenities']   = json_decode($t['amenities'] ?? '[]', true);
        $t['images']      = json_decode($t['images'] ?? '[]', true);
        $t['nights']      = $nights;
        $t['total_price'] = $t['base_price'] * $nights;
    }

    jsonResponse(['room_types' => $types, 'nights' => $nights]);
}

function getRoomTypes(): never {
    $db = getDB();
    $hotel_id = (int)($_GET['hotel_id'] ?? 0);
    if (!$hotel_id) jsonResponse(['error' => 'hotel_id шаардлагатай'], 400);
    $stmt = $db->prepare("SELECT * FROM room_types WHERE hotel_id=? AND is_active=1 ORDER BY base_price");
    $stmt->execute([$hotel_id]);
    $types = $stmt->fetchAll();
    foreach ($types as &$t) {
        $t['amenities'] = json_decode($t['amenities'] ?? '[]', true);
        $t['images']    = json_decode($t['images'] ?? '[]', true);
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

// ═══════════════════════════════════════════════════════════════
// OTP AUTH
// ═══════════════════════════════════════════════════════════════
function sendOTP(array $body): never {
    $email = filter_var($body['email'] ?? '', FILTER_VALIDATE_EMAIL);
    $type  = in_array($body['type'] ?? 'register', ['register','login','reset','booking']) 
             ? $body['type'] : 'register';
    $name  = sanitize($body['name'] ?? 'Хэрэглэгч');

    if (!$email) jsonResponse(['error' => 'Имэйл хаяг буруу байна'], 400);

    $db = getDB();

    // Rate limit: 5 OTP per hour per email
    $stmt = $db->prepare("SELECT COUNT(*) FROM otp_codes WHERE email=? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)");
    $stmt->execute([$email]);
    if ($stmt->fetchColumn() >= 30) {
        jsonResponse(['error' => '1 цагт хамгийн ихдээ 30 код авах боломжтой. Дараа дахин оролдоно уу.'], 429);
    }

    // Check if register type - email should not exist
    if ($type === 'register') {
        $stmt = $db->prepare("SELECT id FROM guests WHERE email=?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            jsonResponse(['error' => 'Энэ имэйл хаяг бүртгэлтэй байна. Нэвтрэх хэсгийг ашиглана уу.'], 409);
        }
    }

    // If login type - email must exist
    if ($type === 'login') {
        $stmt = $db->prepare("SELECT first_name FROM guests WHERE email=?");
        $stmt->execute([$email]);
        $guest = $stmt->fetch();
        if (!$guest) jsonResponse(['error' => 'Имэйл хаяг бүртгэлгүй байна'], 404);
        $name = $guest['first_name'];
    }

    $otp     = generateOTP();
  $expires = date('Y-m-d H:i:s', time() + OTP_EXPIRE_MINUTES*60);

    // Invalidate old codes
    $db->prepare("UPDATE otp_codes SET is_used=1 WHERE email=? AND type=? AND is_used=0")->execute([$email, $type]);

    // Save new OTP
    $db->prepare("INSERT INTO otp_codes (email, code, type, expires_at) VALUES (?,?,?,?)")
       ->execute([$email, $otp, $type, $expires]);

    // Send email
   $sent = sendOTPEmail($email, $name, $otp, $type);

if (!$sent) {
    jsonResponse([
        'error' => 'OTP код илгээхэд алдаа гарлаа. SMTP тохиргоог шалгана уу.'
    ],500);
}

    jsonResponse(['success' => true, 'message' => "$email хаягт " . OTP_EXPIRE_MINUTES . " минутын OTP код илгээлээ"]);
}

function verifyOTP($data){

$pdo = getDB();   // ← ЭНЭ МӨР ДУТУУ БАЙНА

$email = $data['email'] ?? '';
$code  = $data['code'] ?? '';
$type  = $data['type'] ?? 'register';

$stmt = $pdo->prepare("
SELECT *
FROM otp_codes
WHERE email=?
AND code=?
AND type=?
AND is_used=0
AND expires_at > NOW()
LIMIT 1
");

$stmt->execute([$email,$code,$type]);

$otp = $stmt->fetch();

if(!$otp){
jsonResponse(['error'=>'OTP буруу эсвэл хугацаа дууссан'],400);
}

$upd=$pdo->prepare("UPDATE otp_codes SET is_used=1 WHERE id=?");
$upd->execute([$otp['id']]);

$_SESSION['otp_verified_email']=$email;

jsonResponse(['success'=>true]);

}

function registerGuest(array $body): never {

    $email = filter_var($body['email'] ?? '', FILTER_VALIDATE_EMAIL);
    $first = sanitize($body['first_name'] ?? '');
    $last  = sanitize($body['last_name'] ?? '');
    $phone = sanitize($body['phone'] ?? '');
    $password = $body['password'] ?? '';

    if(!$email || !$first || !$last){
        jsonResponse(['error'=>'Мэдээлэл дутуу'],400);
    }

    // OTP verified check
    if(empty($_SESSION['otp_verified_email']) 
        || $_SESSION['otp_verified_email'] !== $email){

        jsonResponse([
            'error'=>'OTP баталгаажуулалт хийгдээгүй байна. Эхлээд OTP баталгаажуулна уу.'
        ],400);
    }

    $db=getDB();

    // duplicate email
    $stmt=$db->prepare("SELECT id FROM guests WHERE email=?");
    $stmt->execute([$email]);

    if($stmt->fetch()){
        jsonResponse(['error'=>'Энэ имэйл бүртгэлтэй байна'],409);
    }

    $hash = password_hash($password,PASSWORD_DEFAULT);

    $db->prepare("
        INSERT INTO guests
        (first_name,last_name,email,phone,password_hash,is_verified)
        VALUES (?,?,?,?,?,1)
    ")->execute([$first,$last,$email,$phone,$hash]);

    $id=$db->lastInsertId();

    $_SESSION['guest_id']=$id;
    $_SESSION['guest_email']=$email;
    $_SESSION['guest_name']=$first.' '.$last;

    unset($_SESSION['otp_verified_email']);

    jsonResponse([
        'success'=>true,
        'name'=>$first.' '.$last,
        'email'=>$email
    ]);
}

function loginGuest(array $body): never {
    $email    = filter_var($body['email'] ?? '', FILTER_VALIDATE_EMAIL);
    $otp_code = sanitize($body['otp_code'] ?? '');
    $password = $body['password'] ?? '';

    if (!$email) jsonResponse(['error' => 'Имэйл хаяг буруу'], 400);

    $db   = getDB();
    $stmt = $db->prepare("SELECT * FROM guests WHERE email=?");
    $stmt->execute([$email]);
    $guest = $stmt->fetch();

    if (!$guest) jsonResponse(['error' => 'Имэйл хаяг бүртгэлгүй байна'], 404);

    // OTP login
    if ($otp_code) {

$stmt = $db->prepare("
SELECT id 
FROM otp_codes 
WHERE email=? 
AND code=? 
AND type='login' 
AND is_used=0 
AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)
");

$stmt->execute([$email,$otp_code]);

$otp = $stmt->fetch();

if(!$otp){
jsonResponse(['error'=>'OTP код буруу эсвэл хугацаа дуусчээ'],400);
}

$db->prepare("UPDATE otp_codes SET is_used=1 WHERE id=?")
   ->execute([$otp['id']]);

}

    // Update last login
    $db->prepare("UPDATE guests SET last_login=NOW() WHERE id=?")->execute([$guest['id']]);

    $_SESSION['guest_id']    = $guest['id'];
    $_SESSION['guest_name']  = $guest['first_name'] . ' ' . $guest['last_name'];
    $_SESSION['guest_email'] = $guest['email'];

    jsonResponse([
        'success' => true,
        'name'    => $_SESSION['guest_name'],
        'email'   => $guest['email'],
        'is_vip'  => $guest['is_vip'],
        'loyalty_points' => $guest['loyalty_points'],
    ]);
}

function logoutGuest(): never {
    session_destroy();
    jsonResponse(['success' => true]);
}

function getSession(): never {
    if (isLoggedIn()) {
        $db   = getDB();
        $stmt = $db->prepare("SELECT id, first_name, last_name, email, is_vip, loyalty_points, total_stays FROM guests WHERE id=?");
        $stmt->execute([$_SESSION['guest_id']]);
        $g = $stmt->fetch();
        jsonResponse(['logged_in' => true, 'guest' => $g]);
    }
    jsonResponse(['logged_in' => false]);
}

// ═══════════════════════════════════════════════════════════════
// BOOKINGS
// ═══════════════════════════════════════════════════════════════
function createBooking(array $body): never {
    if (!isLoggedIn()) jsonResponse(['error' => 'Нэвтрэч орно уу', 'need_auth' => true], 401);

    $db           = getDB();
    $hotel_id     = (int)($body['hotel_id'] ?? 0);
    $room_type_id = (int)($body['room_type_id'] ?? 0);
    $check_in     = $body['check_in'] ?? '';
    $check_out    = $body['check_out'] ?? '';
    $adults       = max(1, (int)($body['adults'] ?? 1));
    $children     = max(0, (int)($body['children'] ?? 0));
    $special      = sanitize($body['special_requests'] ?? '');
    $promo_code   = sanitize($body['promo_code'] ?? '');
    $services     = (array)($body['services'] ?? []);

    if (!$hotel_id || !$room_type_id || !$check_in || !$check_out) {
        jsonResponse(['error' => 'Шаардлагатай мэдээлэл дутуу'], 400);
    }

    $nights = (strtotime($check_out) - strtotime($check_in)) / 86400;
    if ($nights < 1) jsonResponse(['error' => 'Хамгийн багадаа 1 хоног байх ёстой'], 400);

    // Find available room of this type
    $stmt = $db->prepare("SELECT r.* FROM rooms r
                           WHERE r.hotel_id=? AND r.room_type_id=? AND r.status='available'
                           AND r.id NOT IN (
                               SELECT room_id FROM bookings
                               WHERE status NOT IN ('cancelled','checked_out')
                               AND NOT (check_out <= ? OR check_in >= ?)
                           ) LIMIT 1");
    $stmt->execute([$hotel_id, $room_type_id, $check_in, $check_out]);
    $room = $stmt->fetch();
    if (!$room) jsonResponse(['error' => 'Тухайн хугацаанд боломжтой өрөө байхгүй байна'], 409);

    // Room type price
    $stmt = $db->prepare("SELECT * FROM room_types WHERE id=?");
    $stmt->execute([$room_type_id]);
    $rtype = $stmt->fetch();

    $room_total = $rtype['base_price'] * $nights;

    // Promo code
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
        $ph   = implode(',', array_fill(0, count($services), '?'));
        $stmt = $db->prepare("SELECT * FROM services WHERE id IN ($ph) AND is_active=1");
        $stmt->execute($services);
        $svc_items = $stmt->fetchAll();
        foreach ($svc_items as $s) $svc_total += $s['price'];
    }

    $tax   = ($room_total - $discount + $svc_total) * 0.10; // 10% VAT
    $total = $room_total - $discount + $svc_total + $tax;

    $code = 'MH' . date('ymd') . generateCode(5);

    $db->beginTransaction();
    try {
        $stmt = $db->prepare("INSERT INTO bookings 
            (booking_code, hotel_id, guest_id, room_id, check_in, check_out, num_adults, num_children,
             room_price, services_total, discount_amount, tax_amount, total_price, special_requests)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
        $stmt->execute([$code, $hotel_id, $_SESSION['guest_id'], $room['id'], $check_in, $check_out,
                        $adults, $children, $room_total, $svc_total, $discount, $tax, $total, $special]);
        $bid = $db->lastInsertId();

        foreach ($svc_items as $s) {
            $db->prepare("INSERT INTO booking_services (booking_id, service_id, quantity, unit_price) VALUES (?,?,1,?)")
               ->execute([$bid, $s['id'], $s['price']]);
        }

        // Use promo code
        if ($promo_code && !empty($promo)) {
            $db->prepare("UPDATE promo_codes SET used_count=used_count+1 WHERE code=?")->execute([$promo_code]);
        }

        // Update guest stats
        $db->prepare("UPDATE guests SET total_stays=total_stays+1, total_spent=total_spent+?, loyalty_points=loyalty_points+? WHERE id=?")
           ->execute([$total, (int)($total/1000), $_SESSION['guest_id']]);

        $db->commit();

        jsonResponse([
            'success'       => true,
            'booking_id'    => $bid,
            'booking_code'  => $code,
            'total_price'   => $total,
            'breakdown' => [
                'room_total' => $room_total,
                'discount'   => $discount,
                'services'   => $svc_total,
                'tax'        => $tax,
                'total'      => $total,
            ]
        ]);
    } catch (\Throwable $e) {
        $db->rollBack();
        error_log($e->getMessage());
        jsonResponse(['error' => 'Захиалга үүсгэхэд алдаа гарлаа'], 500);
    }
}

function myBookings(): never {
    if (!isLoggedIn()) jsonResponse(['error' => 'Нэвтрэч орно уу', 'need_auth' => true], 401);
    $db   = getDB();
    $stmt = $db->prepare("SELECT b.*, h.name as hotel_name, h.cover_image, r.room_number, rt.name as room_type_name,
                                   p.status as payment_status, p.payment_method
                           FROM bookings b
                           JOIN hotels h ON b.hotel_id=h.id
                           JOIN rooms r ON b.room_id=r.id
                           JOIN room_types rt ON r.room_type_id=rt.id
                           LEFT JOIN payments p ON p.booking_id=b.id AND p.status='completed'
                           WHERE b.guest_id=? ORDER BY b.created_at DESC");
    $stmt->execute([$_SESSION['guest_id']]);
    jsonResponse(['bookings' => $stmt->fetchAll()]);
}

function checkBooking(): never {
    $code = sanitize($_GET['code'] ?? '');
    if (!$code) jsonResponse(['error' => 'Захиалгын код оруулна уу'], 400);
    $db   = getDB();
    $stmt = $db->prepare("SELECT b.*, h.name as hotel_name, h.address, h.phone,
                                   r.room_number, rt.name as room_type_name,
                                   g.first_name, g.last_name, g.email
                           FROM bookings b
                           JOIN hotels h ON b.hotel_id=h.id
                           JOIN rooms r ON b.room_id=r.id
                           JOIN room_types rt ON r.room_type_id=rt.id
                           JOIN guests g ON b.guest_id=g.id
                           WHERE b.booking_code=?");
    $stmt->execute([$code]);
    $booking = $stmt->fetch();
    if (!$booking) jsonResponse(['error' => 'Захиалга олдсонгүй'], 404);
    jsonResponse(['booking' => $booking]);
}

function cancelBooking(array $body): never {
    if (!isLoggedIn()) jsonResponse(['error' => 'Нэвтрэч орно уу'], 401);
    $db = getDB();
    $id = (int)($body['booking_id'] ?? 0);
    $reason = sanitize($body['reason'] ?? '');

    $stmt = $db->prepare("UPDATE bookings SET status='cancelled', cancelled_at=NOW(), cancellation_reason=?
                           WHERE id=? AND guest_id=? AND status IN ('pending','confirmed')");
    $stmt->execute([$reason, $id, $_SESSION['guest_id']]);
    if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Захиалгыг цуцлах боломжгүй'], 400);
    jsonResponse(['success' => true]);
}

function checkPromo(array $body): never {
    $db       = getDB();
    $code     = sanitize($body['code'] ?? '');
    $hotel_id = (int)($body['hotel_id'] ?? 0);
    $nights   = (int)($body['nights'] ?? 1);
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

    jsonResponse([
        'valid'    => true,
        'discount' => $discount,
        'type'     => $promo['discount_type'],
        'value'    => $promo['discount_value'],
        'label'    => $promo['discount_type'] === 'percent' ? $promo['discount_value'].'% хөнгөлөлт' : formatPrice($promo['discount_value']).' хөнгөлөлт',
    ]);
}

// ═══════════════════════════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════════════════════════
function initPayment(array $body): never {
    if (!isLoggedIn()) jsonResponse(['error' => 'Нэвтрэч орно уу'], 401);

    $db         = getDB();
    $booking_id = (int)($body['booking_id'] ?? 0);
    $method     = sanitize($body['method'] ?? '');

    $allowed_methods = ['qpay','socialpay','khanbank','golomtbank','tdbbank','monpay','cash','card','transfer'];
    if (!in_array($method, $allowed_methods)) {
        jsonResponse(['error' => 'Төлбөрийн хэлбэр буруу байна'], 400);
    }

    $stmt = $db->prepare("SELECT b.*, h.name as hotel_name FROM bookings b JOIN hotels h ON b.hotel_id=h.id WHERE b.id=? AND b.guest_id=?");
    $stmt->execute([$booking_id, $_SESSION['guest_id']]);
    $booking = $stmt->fetch();
    if (!$booking) jsonResponse(['error' => 'Захиалга олдсонгүй'], 404);

    // Create payment record
    $db->prepare("INSERT INTO payments (booking_id, payment_method, amount, status) VALUES (?,?,?,'pending')")
       ->execute([$booking_id, $method, $booking['total_price']]);
    $payment_id = $db->lastInsertId();

    if ($method === 'qpay') {
        $qpay = QPay::createInvoice($booking);

        if ($qpay['success']) {
            $db->prepare("UPDATE payments SET qpay_invoice_id=?, qpay_qr_text=?, qpay_qr_image=?, gateway_ref=?, status='processing' WHERE id=?")
               ->execute([$qpay['invoice_id'], $qpay['qr_text'], $qpay['qr_image'], $qpay['invoice_id'], $payment_id]);

            jsonResponse([
                'success'    => true,
                'method'     => 'qpay',
                'payment_id' => $payment_id,
                'qr_text'    => $qpay['qr_text'],
                'qr_image'   => $qpay['qr_image'],
                'invoice_id' => $qpay['invoice_id'],
                'urls'       => $qpay['urls'] ?? [],
                'amount'     => $booking['total_price'],
                'deep_links' => generateDeepLinks($qpay['qr_text'], $booking),
            ]);
        }

        // Sandbox fallback
        $mockQR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        $db->prepare("UPDATE payments SET status='processing', gateway_ref='SANDBOX_TEST' WHERE id=?")->execute([$payment_id]);
        jsonResponse([
            'success'    => true,
            'method'     => 'qpay',
            'payment_id' => $payment_id,
            'qr_text'    => 'SANDBOX_QPay_' . $booking['booking_code'],
            'qr_image'   => $mockQR,
            'sandbox'    => true,
            'amount'     => $booking['total_price'],
            'deep_links' => generateDeepLinks('SANDBOX', $booking),
        ]);

    } elseif (in_array($method, ['socialpay','monpay'])) {
        // SocialPay / MonPay
        $phone_number = $body['phone'] ?? '';
        $db->prepare("UPDATE payments SET status='processing', notes=? WHERE id=?")
           ->execute(["Phone: $phone_number", $payment_id]);

        jsonResponse([
            'success'       => true,
            'method'        => $method,
            'payment_id'    => $payment_id,
            'amount'        => $booking['total_price'],
            'merchant_name' => 'MONGOHOTELS',
            'description'   => "Захиалга #" . $booking['booking_code'],
        ]);

    } elseif (in_array($method, ['khanbank','golomtbank','tdbbank'])) {
        $bank_info = getBankInfo($method, $booking);
        $db->prepare("UPDATE payments SET status='processing' WHERE id=?")->execute([$payment_id]);
        jsonResponse([
            'success'    => true,
            'method'     => $method,
            'payment_id' => $payment_id,
            'bank_info'  => $bank_info,
            'amount'     => $booking['total_price'],
        ]);

    } else {
        // Cash / Card
        $db->prepare("UPDATE payments SET status='pending' WHERE id=?")->execute([$payment_id]);
        jsonResponse([
            'success'    => true,
            'method'     => $method,
            'payment_id' => $payment_id,
            'amount'     => $booking['total_price'],
            'message'    => $method === 'cash' ? 'Буудалд ирэхдээ бэлэн мөнгөөр төлнө үү' : 'Буудалд ирэхдээ картаар төлнө үү',
        ]);
    }
}
function init_payment($body){

    $db = getDB();

    $booking_id = intval($body['booking_id'] ?? 0);
    $method = $body['method'] ?? '';

    if(!$booking_id){
        jsonResponse(['error'=>'booking_id байхгүй'],400);
    }

    $stmt = $db->prepare("
        SELECT total_price, booking_code
        FROM bookings
        WHERE id=?
    ");
    $stmt->execute([$booking_id]);
    $bk = $stmt->fetch();

    if(!$bk){
        jsonResponse(['error'=>'Захиалга олдсонгүй'],404);
    }

    $amount = $bk['total_price'];

    $stmt = $db->prepare("
        INSERT INTO payments
        (booking_id,payment_method,amount,status)
        VALUES (?,?,?,'pending')
    ");

    $stmt->execute([$booking_id,$method,$amount]);

    $payment_id = $db->lastInsertId();

    jsonResponse([
        'success'=>true,
        'payment_id'=>$payment_id,
        'amount'=>$amount,
        'qr_text'=>'QPay_'.$bk['booking_code']
    ]);
}

function generateDeepLinks(string $qr, array $booking): array {
    $encoded = urlencode($qr);
    $amount  = (int)$booking['total_price'];
    return [
        ['name' => 'Хаан Банк', 'logo' => '🏦', 'id' => 'khanbank',
         'url'  => "khanbank://q?qPay_QRcode=$encoded"],
        ['name' => 'Голомт Банк', 'logo' => '🏛', 'id' => 'golomt',
         'url'  => "golomtbank://q?qPay_QRcode=$encoded"],
        ['name' => 'ТДБ Банк', 'logo' => '🏢', 'id' => 'tdb',
         'url'  => "tdbbank://q?qPay_QRcode=$encoded"],
        ['name' => 'Хас Банк', 'logo' => '🌟', 'id' => 'xac',
         'url'  => "xacbank://q?qPay_QRcode=$encoded"],
        ['name' => 'Капитрон Банк', 'logo' => '💠', 'id' => 'capitron',
         'url'  => "capitronbank://q?qPay_QRcode=$encoded"],
        ['name' => 'Мост Манй', 'logo' => '📱', 'id' => 'mostmoney',
         'url'  => "mostmoney://q?qPay_QRcode=$encoded"],
    ];
}

function getBankInfo(string $bank, array $booking): array {
    $banks = [
        'khanbank'   => ['name' => 'Хаан Банк',   'account' => '5000123456', 'branch' => 'Төв салбар'],
        'golomtbank' => ['name' => 'Голомт Банк',  'account' => '1200987654', 'branch' => 'Гоби салбар'],
        'tdbbank'    => ['name' => 'ТДБ Банк',     'account' => '4001234567', 'branch' => 'Улаанбаатар'],
    ];
    $info = $banks[$bank] ?? $banks['khanbank'];
    $info['reference'] = $booking['booking_code'];
    $info['amount']    = $booking['total_price'];
    $info['owner']     = 'МонголHotels ХХК';
    return $info;
}

function checkPaymentStatus(){

$db = getDB();

$payment_id = $_GET['payment_id'] ?? null;

if(!$payment_id){
jsonResponse(['error'=>'payment_id шаардлагатай'],400);
}

$stmt = $db->prepare("SELECT * FROM payments WHERE id=?");
$stmt->execute([$payment_id]);

$payment = $stmt->fetch();

if(!$payment){
jsonResponse(['error'=>'Төлбөр олдсонгүй'],404);
}

jsonResponse([
'success'=>true,
'status'=>$payment['status']
]);

}

function confirmManualPayment(array $body): never {
    if (!isLoggedIn()) jsonResponse(['error' => 'Нэвтрэч орно уу'], 401);
    $db         = getDB();
    $payment_id = (int)($body['payment_id'] ?? 0);
    $ref        = sanitize($body['reference'] ?? '');

    $stmt = $db->prepare("UPDATE payments SET status='completed', transaction_id=?, paid_at=NOW() WHERE id=?");
    $stmt->execute([$ref, $payment_id]);

    // Update booking status
    $stmt = $db->prepare("SELECT booking_id FROM payments WHERE id=?");
    $stmt->execute([$payment_id]);
    $p = $stmt->fetch();
    if ($p) {
        $db->prepare("UPDATE bookings SET status='confirmed' WHERE id=?")->execute([$p['booking_id']]);
    }

    jsonResponse(['success' => true]);
}

// ═══════════════════════════════════════════════════════════════
// REVIEWS
// ═══════════════════════════════════════════════════════════════
function submitReview(array $body): never {
    if (!isLoggedIn()) jsonResponse(['error' => 'Нэвтрэч орно уу'], 401);
    $db = getDB();
    $booking_id = (int)($body['booking_id'] ?? 0);
    $overall    = max(1, min(5, (int)($body['overall'] ?? 5)));
    $clean      = max(1, min(5, (int)($body['cleanliness'] ?? 5)));
    $service    = max(1, min(5, (int)($body['service'] ?? 5)));
    $location   = max(1, min(5, (int)($body['location'] ?? 5)));
    $value      = max(1, min(5, (int)($body['value'] ?? 5)));
    $comment    = sanitize($body['comment'] ?? '');
    $title      = sanitize($body['title'] ?? '');

    $stmt = $db->prepare("SELECT hotel_id FROM bookings WHERE id=? AND guest_id=? AND status='checked_out'");
    $stmt->execute([$booking_id, $_SESSION['guest_id']]);
    $booking = $stmt->fetch();
    if (!$booking) jsonResponse(['error' => 'Зөвхөн дууссан захиалгад үнэлгээ өгч болно'], 400);

    $db->prepare("INSERT INTO reviews (booking_id, hotel_id, guest_id, overall_rating, cleanliness_rating, 
                  service_rating, location_rating, value_rating, title, comment) VALUES (?,?,?,?,?,?,?,?,?,?)
                  ON DUPLICATE KEY UPDATE overall_rating=VALUES(overall_rating), comment=VALUES(comment)")
       ->execute([$booking_id, $booking['hotel_id'], $_SESSION['guest_id'], $overall, $clean, $service, $location, $value, $title, $comment]);

    // Update hotel average
    $db->prepare("UPDATE hotels SET 
        rating = (SELECT AVG(overall_rating) FROM reviews WHERE hotel_id=?),
        total_reviews = (SELECT COUNT(*) FROM reviews WHERE hotel_id=? AND is_published=1)
        WHERE id=?")->execute([$booking['hotel_id'], $booking['hotel_id'], $booking['hotel_id']]);

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
?>