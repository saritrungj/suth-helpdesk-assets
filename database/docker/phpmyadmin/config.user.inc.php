<?php
// database/docker/phpmyadmin/config.user.inc.php — ให้ phpMyAdmin เข้าได้เฉพาะบัญชีอ่านอย่างเดียว (ADR-0024)
//
// phpMyAdmin ที่เข้าด้วย root หรือบัญชีแอปได้ คือทางเข้าที่สองที่แก้ข้อมูลโดยไม่ผ่านกฎสิทธิ์
// และไม่เกิดประวัติ (AGENTS.md) — ปฏิเสธที่ phpMyAdmin เองตั้งแต่ก่อนส่งรหัสไปถึงฐาน
// การแก้ข้อมูลต้องทำผ่านแอป ส่วนงานดูแลฐานที่ต้องใช้ root ให้ใช้ docker exec

$readonly = getenv('SUTH_READONLY_USER') ?: 'suth_readonly';

$cfg['Servers'][1]['AllowRoot'] = false;
$cfg['Servers'][1]['AllowDeny']['order'] = 'explicit';
$cfg['Servers'][1]['AllowDeny']['rules'] = ["allow {$readonly} from all"];
