<?php

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require __DIR__.'/vendor/autoload.php';

function sendOTPEmail($email,$name,$otp,$type='register')
{

$mail = new PHPMailer(true);

try{

$mail->isSMTP();
$mail->Host       = SMTP_HOST;
$mail->SMTPAuth   = true;
$mail->Username   = SMTP_USER;
$mail->Password   = SMTP_PASS;
$mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
$mail->Port       = SMTP_PORT;

$mail->setFrom(SMTP_USER, SMTP_FROM_NAME);
$mail->addAddress($email,$name);

$mail->isHTML(true);
$mail->Subject = "МонголHotels OTP код";

$mail->Body = "
<h2>Баталгаажуулах код</h2>
<h1 style='font-size:40px'>$otp</h1>
<p>Энэ код ".OTP_EXPIRE_MINUTES." минут хүчинтэй.</p>
";

$mail->send();

return true;

}catch(Exception $e){

error_log($mail->ErrorInfo);
return false;

}

}