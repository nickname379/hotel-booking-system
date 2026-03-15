<?php
require_once '../php/config.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

$action = $_REQUEST['action'] ?? '';
$body   = getBody();

if ($action === 'admin_login') { adminLogin($body); exit; }

// All other actions require admin auth
if (!isAdminLoggedIn()) {
    jsonResponse(['error' => 'Нэвтрэлт шаардлагатай', 'redirect' => 'login'], 401);
}

switch ($action) {
    case 'dashboard_stats': dashboardStats(); break;
    case 'get_bookings':    getBookings();    break;
    case 'update_booking':  updateBooking($body); break;
    case 'get_rooms':       getRooms();       break;
    case 'update_room':     updateRoom($body); break;
    case 'get_guests':      getGuests();      break;
    case 'get_payments':    getPayments();    break;
    case 'admin_logout':    adminLogout();    break;
    default: jsonResponse(['error' => 'Буруу хүсэлт'], 400);
}

function adminLogin(array $body): never {
    $db   = getDB();
    $user = sanitize($body['username'] ?? '');
    $pass = $body['password'] ?? '';
    if (!$user || !$pass) jsonResponse(['error' => 'Нэвтрэх нэр болон нууц үг оруулна уу'], 400);

    $stmt = $db->prepare("SELECT * FROM admins WHERE (username=? OR email=?) AND is_active=1 LIMIT 1");
    $stmt->execute([$user, $user]);
    $admin = $stmt->fetch();

    // Accept 'password' as universal demo password
    $validPass = $admin && (password_verify($pass, $admin['password_hash']) || $pass === 'password');
    if (!$admin || !$validPass) {
        jsonResponse(['error' => 'Нэвтрэх нэр эсвэл нууц үг буруу байна'], 401);
    }

    $_SESSION['admin_id']    = $admin['id'];
    $_SESSION['admin_name']  = $admin['full_name'];
    $_SESSION['admin_role']  = $admin['role'];
    $_SESSION['admin_hotel'] = $admin['hotel_id'];

    $db->prepare("UPDATE admins SET last_login=NOW() WHERE id=?")->execute([$admin['id']]);
    jsonResponse(['success' => true, 'name' => $admin['full_name'], 'role' => $admin['role'], 'hotel_id' => $admin['hotel_id']]);
}

function adminLogout(): never {
    unset($_SESSION['admin_id'], $_SESSION['admin_name'], $_SESSION['admin_role'], $_SESSION['admin_hotel']);
    jsonResponse(['success' => true]);
}

function dashboardStats(): never {
    $db       = getDB();
    $hotel_id = (int)($_GET['hotel_id'] ?? $_SESSION['admin_hotel'] ?? 0);
    $today    = date('Y-m-d');
    $mstart   = date('Y-m-01');
    $where    = $hotel_id ? "AND b.hotel_id=$hotel_id" : '';
    $hwhere   = $hotel_id ? "AND hotel_id=$hotel_id" : '';

    // Bookings summary
    $stmt = $db->query("SELECT 
        COUNT(*) as total,
        SUM(status='pending') as pending,
        SUM(status='confirmed') as confirmed,
        SUM(status='checked_in') as checked_in,
        SUM(status='cancelled') as cancelled
        FROM bookings b WHERE 1=1 $where");
    $bookings = $stmt->fetch();

    // Monthly revenue
    $stmt = $db->prepare("SELECT COALESCE(SUM(b.total_price),0) as rev FROM bookings b
                           WHERE b.status NOT IN ('cancelled') AND b.created_at >= ? $where");
    $stmt->execute([$mstart]);
    $monthly = $stmt->fetchColumn();

    // Today checkins/checkouts
    $stmt = $db->query("SELECT SUM(check_in='$today') as cin, SUM(check_out='$today') as cout FROM bookings b WHERE 1=1 $where");
    $today_data = $stmt->fetch();

    // Occupancy
    $stmt = $db->query("SELECT COUNT(*) FROM rooms WHERE 1=1 $hwhere");
    $total_rooms = (int)$stmt->fetchColumn();
    $stmt = $db->query("SELECT COUNT(*) FROM bookings b WHERE status='checked_in' $where");
    $occupied = (int)$stmt->fetchColumn();
    $occ_rate = $total_rooms > 0 ? round($occupied / $total_rooms * 100) : 0;

    // Total guests
    $stmt = $db->query("SELECT COUNT(*) FROM guests");
    $total_guests = (int)$stmt->fetchColumn();

    // Recent bookings (last 10)
    $sql = "SELECT b.*, h.name as hotel_name, r.room_number, rt.name as room_type_name,
                   g.first_name, g.last_name, g.email
            FROM bookings b
            JOIN hotels h ON b.hotel_id=h.id
            JOIN rooms r ON b.room_id=r.id
            JOIN room_types rt ON r.room_type_id=rt.id
            JOIN guests g ON b.guest_id=g.id
            WHERE 1=1 $where ORDER BY b.created_at DESC LIMIT 10";
    $recent = $db->query($sql)->fetchAll();

    jsonResponse([
        'stats' => [
            'bookings'        => $bookings,
            'monthly_revenue' => $monthly,
            'today_checkins'  => $today_data['cin'] ?? 0,
            'today_checkouts' => $today_data['cout'] ?? 0,
            'total_guests'    => $total_guests,
            'occupancy'       => ['total' => $total_rooms, 'occupied' => $occupied, 'rate' => $occ_rate],
        ],
        'recent_bookings' => $recent,
    ]);
}

function getBookings(): never {
    $db       = getDB();
    $hotel_id = (int)($_GET['hotel_id'] ?? $_SESSION['admin_hotel'] ?? 0);
    $status   = sanitize($_GET['status'] ?? '');
    $date     = sanitize($_GET['date'] ?? '');
    $search   = sanitize($_GET['search'] ?? '');
    $where    = $hotel_id ? "AND b.hotel_id=$hotel_id" : '';
    $params   = [];

    $sql = "SELECT b.*, h.name as hotel_name, r.room_number, rt.name as room_type_name,
                   g.first_name, g.last_name, g.email, g.phone,
                   p.status as payment_status, p.payment_method
            FROM bookings b
            JOIN hotels h ON b.hotel_id=h.id
            JOIN rooms r ON b.room_id=r.id
            JOIN room_types rt ON r.room_type_id=rt.id
            JOIN guests g ON b.guest_id=g.id
            LEFT JOIN payments p ON p.booking_id=b.id AND p.status='completed'
            WHERE 1=1 $where";

    if ($status) { $sql .= " AND b.status=?"; $params[] = $status; }
    if ($date)   { $sql .= " AND (b.check_in=? OR b.check_out=?)"; $params[] = $date; $params[] = $date; }
    if ($search) {
        $s = "%$search%";
        $sql .= " AND (b.booking_code LIKE ? OR g.first_name LIKE ? OR g.last_name LIKE ? OR g.email LIKE ?)";
        $params = array_merge($params, [$s, $s, $s, $s]);
    }
    $sql .= " ORDER BY b.created_at DESC LIMIT 200";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonResponse(['bookings' => $stmt->fetchAll()]);
}

function updateBooking(array $body): never {
    $db     = getDB();
    $id     = (int)($body['id'] ?? 0);
    $status = sanitize($body['status'] ?? '');
    $allowed = ['pending','confirmed','checked_in','checked_out','cancelled','no_show'];
    if (!in_array($status, $allowed)) jsonResponse(['error' => 'Буруу статус'], 400);
    $db->prepare("UPDATE bookings SET status=?, updated_at=NOW() WHERE id=?")->execute([$status, $id]);
    jsonResponse(['success' => true]);
}

function getRooms(): never {
    $db       = getDB();
    $hotel_id = (int)($_GET['hotel_id'] ?? $_SESSION['admin_hotel'] ?? 0);
    $where    = $hotel_id ? "AND r.hotel_id=$hotel_id" : '';
    $stmt = $db->query("SELECT r.*, h.name as hotel_name, rt.name as room_type_name, rt.base_price
                         FROM rooms r
                         JOIN hotels h ON r.hotel_id=h.id
                         JOIN room_types rt ON r.room_type_id=rt.id
                         WHERE 1=1 $where ORDER BY h.id, r.floor, r.room_number");
    jsonResponse(['rooms' => $stmt->fetchAll()]);
}

function updateRoom(array $body): never {
    $db      = getDB();
    $id      = (int)($body['id'] ?? 0);
    $status  = sanitize($body['status'] ?? '');
    $allowed = ['available','occupied','maintenance','cleaning','out_of_order'];
    if (!in_array($status, $allowed)) jsonResponse(['error' => 'Буруу статус'], 400);
    $db->prepare("UPDATE rooms SET status=? WHERE id=?")->execute([$status, $id]);
    jsonResponse(['success' => true]);
}

function getGuests(): never {
    $db   = getDB();
    $stmt = $db->query("SELECT g.*, 
                                COUNT(b.id) as booking_count,
                                COALESCE(SUM(b.total_price),0) as total_spent
                         FROM guests g
                         LEFT JOIN bookings b ON g.id=b.guest_id AND b.status NOT IN ('cancelled')
                         GROUP BY g.id
                         ORDER BY g.created_at DESC LIMIT 200");
    jsonResponse(['guests' => $stmt->fetchAll()]);
}

function getPayments(): never {
    $db       = getDB();
    $hotel_id = (int)($_GET['hotel_id'] ?? $_SESSION['admin_hotel'] ?? 0);
    $where    = $hotel_id ? "AND b.hotel_id=$hotel_id" : '';
    $stmt = $db->query("SELECT p.*, b.booking_code, b.total_price as booking_total
                         FROM payments p
                         JOIN bookings b ON p.booking_id=b.id
                         WHERE 1=1 $where
                         ORDER BY p.created_at DESC LIMIT 200");
    jsonResponse(['payments' => $stmt->fetchAll()]);
}
?>