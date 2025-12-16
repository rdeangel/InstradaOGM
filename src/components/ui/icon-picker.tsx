'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Define a subset of Lucide icons to offer in the picker
export const curatedLucideIcons: { name: string; icon: LucideIcon }[] = [
  { name: 'Activity', icon: LucideIcons.Activity },
  { name: 'AlertCircle', icon: LucideIcons.AlertCircle },
  { name: 'AlertOctagon', icon: LucideIcons.AlertOctagon },
  { name: 'AlertTriangle', icon: LucideIcons.AlertTriangle },
  { name: 'Anchor', icon: LucideIcons.Anchor },
  { name: 'Archive', icon: LucideIcons.Archive },
  { name: 'ArchiveRestore', icon: LucideIcons.ArchiveRestore },
  { name: 'Baby', icon: LucideIcons.Baby },
  { name: 'Ban', icon: LucideIcons.Ban },
  { name: 'Barcode', icon: LucideIcons.Barcode },
  { name: 'BatteryCharging', icon: LucideIcons.BatteryCharging },
  { name: 'BatteryFull', icon: LucideIcons.BatteryFull },
  { name: 'BatteryLow', icon: LucideIcons.BatteryLow },
  { name: 'BatteryMedium', icon: LucideIcons.BatteryMedium },
  { name: 'Bell', icon: LucideIcons.Bell },
  { name: 'BellDot', icon: LucideIcons.BellDot },
  { name: 'BellOff', icon: LucideIcons.BellOff },
  { name: 'BellRing', icon: LucideIcons.BellRing },
  { name: 'Box', icon: LucideIcons.Box },
  { name: 'Briefcase', icon: LucideIcons.Briefcase },
  { name: 'Bug', icon: LucideIcons.Bug },
  { name: 'Building', icon: LucideIcons.Building },
  { name: 'Bus', icon: LucideIcons.Bus },
  { name: 'Cable', icon: LucideIcons.Cable },
  { name: 'Calendar', icon: LucideIcons.Calendar },
  { name: 'Camera', icon: LucideIcons.Camera },
  { name: 'Car', icon: LucideIcons.Car },
  { name: 'CheckCircle', icon: LucideIcons.CheckCircle },
  { name: 'CheckSquare', icon: LucideIcons.CheckSquare },
  { name: 'CircuitBoard', icon: LucideIcons.CircuitBoard },
  { name: 'CircleDot', icon: LucideIcons.CircleDot },
  { name: 'CircleOff', icon: LucideIcons.CircleOff },
  { name: 'CircleSlash', icon: LucideIcons.CircleSlash },
  { name: 'CircleX', icon: LucideIcons.CircleX },
  { name: 'Clipboard', icon: LucideIcons.Clipboard },
  { name: 'ClipboardCheck', icon: LucideIcons.ClipboardCheck },
  { name: 'ClipboardCopy', icon: LucideIcons.ClipboardCopy },
  { name: 'ClipboardList', icon: LucideIcons.ClipboardList },
  { name: 'ClipboardX', icon: LucideIcons.ClipboardX },
  { name: 'Cloud', icon: LucideIcons.Cloud },
  { name: 'CloudLightning', icon: LucideIcons.CloudLightning },
  { name: 'CloudOff', icon: LucideIcons.CloudOff },
  { name: 'CloudRain', icon: LucideIcons.CloudRain },
  { name: 'CloudSnow', icon: LucideIcons.CloudSnow },
  { name: 'CloudSun', icon: LucideIcons.CloudSun },
  { name: 'Code', icon: LucideIcons.Code },
  { name: 'Columns', icon: LucideIcons.Columns },
  { name: 'Component', icon: LucideIcons.Component },
  { name: 'Copy', icon: LucideIcons.Copy },
  { name: 'Cpu', icon: LucideIcons.Cpu },
  { name: 'Database', icon: LucideIcons.Database },
  { name: 'DollarSign', icon: LucideIcons.DollarSign },
  { name: 'Download', icon: LucideIcons.Download },
  { name: 'ExternalLink', icon: LucideIcons.ExternalLink },
  { name: 'Eye', icon: LucideIcons.Eye },
  { name: 'EyeOff', icon: LucideIcons.EyeOff },
  { name: 'FastForward', icon: LucideIcons.FastForward },
  { name: 'File', icon: LucideIcons.File },
  { name: 'FileArchive', icon: LucideIcons.FileArchive },
  { name: 'FileAudio', icon: LucideIcons.FileAudio },
  { name: 'FileBarChart', icon: LucideIcons.FileBarChart },
  { name: 'FileClock', icon: LucideIcons.FileClock },
  { name: 'FileCode', icon: LucideIcons.FileCode },
  { name: 'FileDown', icon: LucideIcons.FileDown },
  { name: 'FileHeart', icon: LucideIcons.FileHeart },
  { name: 'FileImage', icon: LucideIcons.FileImage },
  { name: 'FileJson', icon: LucideIcons.FileJson },
  { name: 'FileKey', icon: LucideIcons.FileKey },
  { name: 'FileLock', icon: LucideIcons.FileLock },
  { name: 'FileMinus', icon: LucideIcons.FileMinus },
  { name: 'FilePen', icon: LucideIcons.FilePen },
  { name: 'FilePieChart', icon: LucideIcons.FilePieChart },
  { name: 'FilePlus', icon: LucideIcons.FilePlus },
  { name: 'FileQuestion', icon: LucideIcons.FileQuestion },
  { name: 'FileSearch', icon: LucideIcons.FileSearch },
  { name: 'FileSliders', icon: LucideIcons.FileSliders },
  { name: 'FileSpreadsheet', icon: LucideIcons.FileSpreadsheet },
  { name: 'FileStack', icon: LucideIcons.FileStack },
  { name: 'FileSymlink', icon: LucideIcons.FileSymlink },
  { name: 'FileTerminal', icon: LucideIcons.FileTerminal },
  { name: 'FileText', icon: LucideIcons.FileText },
  { name: 'FileType', icon: LucideIcons.FileType },
  { name: 'FileUp', icon: LucideIcons.FileUp },
  { name: 'FileVideo', icon: LucideIcons.FileVideo },
  { name: 'FileWarning', icon: LucideIcons.FileWarning },
  { name: 'FileX', icon: LucideIcons.FileX },
  { name: 'Filter', icon: LucideIcons.Filter },
  { name: 'FilterX', icon: LucideIcons.FilterX },
  { name: 'Fingerprint', icon: LucideIcons.Fingerprint },
  { name: 'Flag', icon: LucideIcons.Flag },
  { name: 'Folder', icon: LucideIcons.Folder },
  { name: 'FolderMinus', icon: LucideIcons.FolderMinus },
  { name: 'FolderOpen', icon: LucideIcons.FolderOpen },
  { name: 'FolderPlus', icon: LucideIcons.FolderPlus },
  { name: 'FolderX', icon: LucideIcons.FolderX },
  { name: 'Gamepad', icon: LucideIcons.Gamepad },
  { name: 'Gauge', icon: LucideIcons.Gauge },
  { name: 'Gift', icon: LucideIcons.Gift },
  { name: 'Globe', icon: LucideIcons.Globe },
  { name: 'Grid', icon: LucideIcons.Grid },
  { name: 'Grid2x2', icon: LucideIcons.Grid2x2 },
  { name: 'Grid3x3', icon: LucideIcons.Grid3x3 },
  { name: 'HardDrive', icon: LucideIcons.HardDrive },
  { name: 'Headphones', icon: LucideIcons.Headphones },
  { name: 'Heart', icon: LucideIcons.Heart },
  { name: 'HelpCircle', icon: LucideIcons.HelpCircle },
  { name: 'Home', icon: LucideIcons.Home },
  { name: 'Info', icon: LucideIcons.Info },
  { name: 'Key', icon: LucideIcons.Key },
  { name: 'Laptop', icon: LucideIcons.Laptop },
  { name: 'Layout', icon: LucideIcons.Layout },
  { name: 'LayoutDashboard', icon: LucideIcons.LayoutDashboard },
  { name: 'LayoutGrid', icon: LucideIcons.LayoutGrid },
  { name: 'List', icon: LucideIcons.List },
  { name: 'ListChecks', icon: LucideIcons.ListChecks },
  { name: 'ListEnd', icon: LucideIcons.ListEnd },
  { name: 'ListMinus', icon: LucideIcons.ListMinus },
  { name: 'ListMusic', icon: LucideIcons.ListMusic },
  { name: 'ListOrdered', icon: LucideIcons.ListOrdered },
  { name: 'ListPlus', icon: LucideIcons.ListPlus },
  { name: 'ListStart', icon: LucideIcons.ListStart },
  { name: 'ListX', icon: LucideIcons.ListX },
  { name: 'Lock', icon: LucideIcons.Lock },
  { name: 'Mail', icon: LucideIcons.Mail },
  { name: 'MailCheck', icon: LucideIcons.MailCheck },
  { name: 'MailOpen', icon: LucideIcons.MailOpen },
  { name: 'MailX', icon: LucideIcons.MailX },
  { name: 'MemoryStick', icon: LucideIcons.MemoryStick },
  { name: 'MessageCircle', icon: LucideIcons.MessageCircle },
  { name: 'MessageSquare', icon: LucideIcons.MessageSquare },
  { name: 'Mic', icon: LucideIcons.Mic },
  { name: 'MicOff', icon: LucideIcons.MicOff },
  { name: 'Monitor', icon: LucideIcons.Monitor },
  { name: 'Network', icon: LucideIcons.Network },
  { name: 'Package', icon: LucideIcons.Package },
  { name: 'Package2', icon: LucideIcons.Package2 },
  { name: 'Palette', icon: LucideIcons.Palette },
  { name: 'Paperclip', icon: LucideIcons.Paperclip },
  { name: 'Pause', icon: LucideIcons.Pause },
  { name: 'Phone', icon: LucideIcons.Phone },
  { name: 'PhoneCall', icon: LucideIcons.PhoneCall },
  { name: 'PhoneIncoming', icon: LucideIcons.PhoneIncoming },
  { name: 'PhoneMissed', icon: LucideIcons.PhoneMissed },
  { name: 'PhoneOff', icon: LucideIcons.PhoneOff },
  { name: 'PhoneOutgoing', icon: LucideIcons.PhoneOutgoing },
  { name: 'Plane', icon: LucideIcons.Plane },
  { name: 'Play', icon: LucideIcons.Play },
  { name: 'Plug', icon: LucideIcons.Plug },
  { name: 'Power', icon: LucideIcons.Power },
  { name: 'Printer', icon: LucideIcons.Printer },
  { name: 'QrCode', icon: LucideIcons.QrCode },
  { name: 'Redo', icon: LucideIcons.Redo },
  { name: 'RefreshCcw', icon: LucideIcons.RefreshCcw },
  { name: 'RefreshCw', icon: LucideIcons.RefreshCw },
  { name: 'Repeat', icon: LucideIcons.Repeat },
  { name: 'Rocket', icon: LucideIcons.Rocket },
  { name: 'RotateCcw', icon: LucideIcons.RotateCcw },
  { name: 'RotateCw', icon: LucideIcons.RotateCw },
  { name: 'Router', icon: LucideIcons.Router },
  { name: 'Rows', icon: LucideIcons.Rows },
  { name: 'Scan', icon: LucideIcons.Scan },
  { name: 'Search', icon: LucideIcons.Search },
  { name: 'SearchCheck', icon: LucideIcons.SearchCheck },
  { name: 'SearchX', icon: LucideIcons.SearchX },
  { name: 'Send', icon: LucideIcons.Send },
  { name: 'Server', icon: LucideIcons.Server },
  { name: 'ServerCog', icon: LucideIcons.ServerCog },
  { name: 'ServerCrash', icon: LucideIcons.ServerCrash },
  { name: 'ServerOff', icon: LucideIcons.ServerOff },
  { name: 'Settings', icon: LucideIcons.Settings },
  { name: 'Settings2', icon: LucideIcons.Settings2 },
  { name: 'Shield', icon: LucideIcons.Shield },
  { name: 'ShieldCheck', icon: LucideIcons.ShieldCheck },
  { name: 'ShieldOff', icon: LucideIcons.ShieldOff },
  { name: 'ShieldQuestion', icon: LucideIcons.ShieldQuestion },
  { name: 'ShieldX', icon: LucideIcons.ShieldX },
  { name: 'Ship', icon: LucideIcons.Ship },
  { name: 'Shuffle', icon: LucideIcons.Shuffle },
  { name: 'Signal', icon: LucideIcons.Signal },
  { name: 'SignalHigh', icon: LucideIcons.SignalHigh },
  { name: 'SignalLow', icon: LucideIcons.SignalLow },
  { name: 'SignalMedium', icon: LucideIcons.SignalMedium },
  { name: 'SignalZero', icon: LucideIcons.SignalZero },
  { name: 'SkipBack', icon: LucideIcons.SkipBack },
  { name: 'SkipForward', icon: LucideIcons.SkipForward },
  { name: 'Sliders', icon: LucideIcons.Sliders },
  { name: 'SlidersHorizontal', icon: LucideIcons.SlidersHorizontal },
  { name: 'Smartphone', icon: LucideIcons.Smartphone },
  { name: 'Speaker', icon: LucideIcons.Speaker },
  { name: 'SquareDot', icon: LucideIcons.SquareDot },
  { name: 'SquareSlash', icon: LucideIcons.SquareSlash },
  { name: 'SwitchCamera', icon: LucideIcons.SwitchCamera },
  { name: 'Table', icon: LucideIcons.Table },
  { name: 'Tablet', icon: LucideIcons.Tablet },
  { name: 'Terminal', icon: LucideIcons.Terminal },
  { name: 'ThumbsUp', icon: LucideIcons.ThumbsUp },
  { name: 'ToggleLeft', icon: LucideIcons.ToggleLeft },
  { name: 'ToggleRight', icon: LucideIcons.ToggleRight },
  { name: 'Train', icon: LucideIcons.Train },
  { name: 'Trash', icon: LucideIcons.Trash },
  { name: 'Trash2', icon: LucideIcons.Trash2 },
  { name: 'Undo', icon: LucideIcons.Undo },
  { name: 'Unlock', icon: LucideIcons.Unlock },
  { name: 'Upload', icon: LucideIcons.Upload },
  { name: 'Usb', icon: LucideIcons.Usb },
  { name: 'User', icon: LucideIcons.User },
  { name: 'UserCog', icon: LucideIcons.UserCog },
  { name: 'Users', icon: LucideIcons.Users },
  { name: 'Voicemail', icon: LucideIcons.Voicemail },
  { name: 'Volume', icon: LucideIcons.Volume },
  { name: 'Volume1', icon: LucideIcons.Volume1 },
  { name: 'Volume2', icon: LucideIcons.Volume2 },
  { name: 'VolumeX', icon: LucideIcons.VolumeX },
  { name: 'Wifi', icon: LucideIcons.Wifi },
  { name: 'WifiOff', icon: LucideIcons.WifiOff },
  { name: 'XCircle', icon: LucideIcons.XCircle },
  { name: 'XSquare', icon: LucideIcons.XSquare },
  { name: 'Zap', icon: LucideIcons.Zap },
  { name: 'ZoomIn', icon: LucideIcons.ZoomIn },
  { name: 'ZoomOut', icon: LucideIcons.ZoomOut },
];

// Comprehensive list of flag emojis with names for searchability
export const flags: { value: string; name: string }[] = [
  { value: '🇦🇫', name: 'Afghanistan' },
  { value: '🇦🇱', name: 'Albania' },
  { value: '🇩🇿', name: 'Algeria' },
  { value: '🇦🇸', name: 'American Samoa' },
  { value: '🇦🇩', name: 'Andorra' },
  { value: '🇦🇴', name: 'Angola' },
  { value: '🇦🇮', name: 'Anguilla' },
  { value: '🇦🇬', name: 'Antigua & Barbuda' },
  { value: '🇦🇶', name: 'Antarctica' },
  { value: '🇦🇷', name: 'Argentina' },
  { value: '🇦🇲', name: 'Armenia' },
  { value: '🇦🇼', name: 'Aruba' },
  { value: '🇦🇨', name: 'Ascension Island' },
  { value: '🇦🇺', name: 'Australia' },
  { value: '🇦🇹', name: 'Austria' },
  { value: '🇦🇿', name: 'Azerbaijan' },
  { value: '🇧🇸', name: 'Bahamas' },
  { value: '🇧🇭', name: 'Bahrain' },
  { value: '🇧🇩', name: 'Bangladesh' },
  { value: '🇧🇧', name: 'Barbados' },
  { value: '🇧🇾', name: 'Belarus' },
  { value: '🇧🇪', name: 'Belgium' },
  { value: '🇧🇿', name: 'Belize' },
  { value: '🇧🇯', name: 'Benin' },
  { value: '🇧🇲', name: 'Bermuda' },
  { value: '🇧🇹', name: 'Bhutan' },
  { value: '🏴', name: 'Black' },
  { value: '🇧🇴', name: 'Bolivia' },
  { value: '🇧🇦', name: 'Bosnia & Herzegovina' },
  { value: '🇧🇼', name: 'Botswana' },
  { value: '🇧🇻', name: 'Bouvet Island' },
  { value: '🇧🇷', name: 'Brazil' },
  { value: '🇮🇴', name: 'British Indian Ocean Territory' },
  { value: '🇻🇬', name: 'British Virgin Islands' },
  { value: '🇧🇳', name: 'Brunei' },
  { value: '🇧🇬', name: 'Bulgaria' },
  { value: '🇧🇫', name: 'Burkina Faso' },
  { value: '🇧🇮', name: 'Burundi' },
  { value: '🇰🇭', name: 'Cambodia' },
  { value: '🇨🇲', name: 'Cameroon' },
  { value: '🇨🇦', name: 'Canada' },
  { value: '🇮🇨', name: 'Canary Islands' },
  { value: '🇨🇻', name: 'Cape Verde' },
  { value: '🇧🇶', name: 'Caribbean Netherlands' },
  { value: '🇰🇾', name: 'Cayman Islands' },
  { value: '🇨🇫', name: 'Central African Republic' },
  { value: '🇪🇦', name: 'Ceuta & Melilla' },
  { value: '🇹🇩', name: 'Chad' },
  { value: '🏁', name: 'Chequered' },
  { value: '🇨🇱', name: 'Chile' },
  { value: '🇨🇳', name: 'China' },
  { value: '🇨🇽', name: 'Christmas Island' },
  { value: '🇨🇵', name: 'Clipperton Island' },
  { value: '🇨🇨', name: 'Cocos (Keeling) Islands' },
  { value: '🇨🇴', name: 'Colombia' },
  { value: '🇰🇲', name: 'Comoros' },
  { value: '🇨🇬', name: 'Congo - Brazzaville' },
  { value: '🇨🇩', name: 'Congo - Kinshasa' },
  { value: '🇨🇰', name: 'Cook Islands' },
  { value: '🇨🇷', name: 'Costa Rica' },
  { value: '🇨🇮', name: 'Côte d’Ivoire' },
  { value: '🇭🇷', name: 'Croatia' },
  { value: '🎌', name: 'Crossed' },
  { value: '🇨🇺', name: 'Cuba' },
  { value: '🇨🇼', name: 'Curaçao' },
  { value: '🇨🇾', name: 'Cyprus' },
  { value: '🇨🇿', name: 'Czechia' },
  { value: '🇩🇰', name: 'Denmark' },
  { value: '🇩🇬', name: 'Diego Garcia' },
  { value: '🇩🇯', name: 'Djibouti' },
  { value: '🇩🇲', name: 'Dominica' },
  { value: '🇩🇴', name: 'Dominican Republic' },
  { value: '🇪🇨', name: 'Ecuador' },
  { value: '🇪🇬', name: 'Egypt' },
  { value: '🇸🇻', name: 'El Salvador' },
  { value: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', name: 'England' },
  { value: '🇬🇶', name: 'Equatorial Guinea' },
  { value: '🇪🇷', name: 'Eritrea' },
  { value: '🇪🇪', name: 'Estonia' },
  { value: '🇪🇹', name: 'Ethiopia' },
  { value: '🇪🇺', name: 'European Union' },
  { value: '🇫🇰', name: 'Falkland Islands' },
  { value: '🇫🇴', name: 'Faroe Islands' },
  { value: '🇫🇯', name: 'Fiji' },
  { value: '🇫🇮', name: 'Finland' },
  { value: '🇫🇷', name: 'France' },
  { value: '🇬🇫', name: 'French Guiana' },
  { value: '🇵🇫', name: 'French Polynesia' },
  { value: '🇹🇫', name: 'French Southern Territories' },
  { value: '🇬🇦', name: 'Gabon' },
  { value: '🇬🇲', name: 'Gambia' },
  { value: '🇬🇪', name: 'Georgia' },
  { value: '🇩🇪', name: 'Germany' },
  { value: '🇬🇭', name: 'Ghana' },
  { value: '🇬🇮', name: 'Gibraltar' },
  { value: '🇬🇷', name: 'Greece' },
  { value: '🇬🇱', name: 'Greenland' },
  { value: '🇬🇩', name: 'Grenada' },
  { value: '🇬🇵', name: 'Guadeloupe' },
  { value: '🇬🇺', name: 'Guam' },
  { value: '🇬🇹', name: 'Guatemala' },
  { value: '🇬🇬', name: 'Guernsey' },
  { value: '🇬🇳', name: 'Guinea' },
  { value: '🇬🇼', name: 'Guinea-Bissau' },
  { value: '🇬🇾', name: 'Guyana' },
  { value: '🇭🇹', name: 'Haiti' },
  { value: '🇭🇲', name: 'Heard & McDonald Islands' },
  { value: '🇭🇳', name: 'Honduras' },
  { value: '🇭🇰', name: 'Hong Kong SAR China' },
  { value: '🇭🇺', name: 'Hungary' },
  { value: '🇮🇸', name: 'Iceland' },
  { value: '🇮🇳', name: 'India' },
  { value: '🇮🇩', name: 'Indonesia' },
  { value: '🇮🇷', name: 'Iran' },
  { value: '🇮🇶', name: 'Iraq' },
  { value: '🇮🇪', name: 'Ireland' },
  { value: '🇮🇲', name: 'Isle of Man' },
  { value: '🇮🇱', name: 'Israel' },
  { value: '🇮🇹', name: 'Italy' },
  { value: '🇯🇲', name: 'Jamaica' },
  { value: '🇯🇵', name: 'Japan' },
  { value: '🇯🇪', name: 'Jersey' },
  { value: '🇯🇴', name: 'Jordan' },
  { value: '🇰🇿', name: 'Kazakhstan' },
  { value: '🇰🇪', name: 'Kenya' },
  { value: '🇰🇮', name: 'Kiribati' },
  { value: '🇽🇰', name: 'Kosovo' },
  { value: '🇰🇼', name: 'Kuwait' },
  { value: '🇰🇬', name: 'Kyrgyzstan' },
  { value: '🇱🇦', name: 'Laos' },
  { value: '🇱🇻', name: 'Latvia' },
  { value: '🇱🇧', name: 'Lebanon' },
  { value: '🇱🇸', name: 'Lesotho' },
  { value: '🇱🇷', name: 'Liberia' },
  { value: '🇱🇾', name: 'Libya' },
  { value: '🇱🇮', name: 'Liechtenstein' },
  { value: '🇱🇹', name: 'Lithuania' },
  { value: '🇱🇺', name: 'Luxembourg' },
  { value: '🇲🇴', name: 'Macao SAR China' },
  { value: '🇲🇰', name: 'Macedonia' },
  { value: '🇲🇬', name: 'Madagascar' },
  { value: '🇲🇼', name: 'Malawi' },
  { value: '🇲🇾', name: 'Malaysia' },
  { value: '🇲🇻', name: 'Maldives' },
  { value: '🇲🇱', name: 'Mali' },
  { value: '🇲🇹', name: 'Malta' },
  { value: '🇲🇭', name: 'Marshall Islands' },
  { value: '🇲🇶', name: 'Martinique' },
  { value: '🇲🇷', name: 'Mauritania' },
  { value: '🇲🇺', name: 'Mauritius' },
  { value: '🇾🇹', name: 'Mayotte' },
  { value: '🇲🇽', name: 'Mexico' },
  { value: '🇫🇲', name: 'Micronesia' },
  { value: '🇲🇩', name: 'Moldova' },
  { value: '🇲🇨', name: 'Monaco' },
  { value: '🇲🇳', name: 'Mongolia' },
  { value: '🇲🇪', name: 'Montenegro' },
  { value: '🇲🇸', name: 'Montserrat' },
  { value: '🇲🇦', name: 'Morocco' },
  { value: '🇲🇿', name: 'Mozambique' },
  { value: '🇲🇲', name: 'Myanmar (Burma)' },
  { value: '🇳🇦', name: 'Namibia' },
  { value: '🇳🇷', name: 'Nauru' },
  { value: '🇳🇵', name: 'Nepal' },
  { value: '🇳🇱', name: 'Netherlands' },
  { value: '🇳🇨', name: 'New Caledonia' },
  { value: '🇳🇿', name: 'New Zealand' },
  { value: '🇳🇮', name: 'Nicaragua' },
  { value: '🇳🇪', name: 'Niger' },
  { value: '🇳🇬', name: 'Nigeria' },
  { value: '🇳🇺', name: 'Niue' },
  { value: '🇳🇫', name: 'Norfolk Island' },
  { value: '🇰🇵', name: 'North Korea' },
  { value: '🇲🇵', name: 'Northern Mariana Islands' },
  { value: '🇳🇴', name: 'Norway' },
  { value: '🇴🇲', name: 'Oman' },
  { value: '🇵🇰', name: 'Pakistan' },
  { value: '🇵🇼', name: 'Palau' },
  { value: '🇵🇸', name: 'Palestinian Territories' },
  { value: '🇵🇦', name: 'Panama' },
  { value: '🇵🇬', name: 'Papua New Guinea' },
  { value: '🇵🇾', name: 'Paraguay' },
  { value: '🇵🇪', name: 'Peru' },
  { value: '🇵🇭', name: 'Philippines' },
  { value: '🏴‍☠️', name: 'Pirate' },
  { value: '🇵🇳', name: 'Pitcairn Islands' },
  { value: '🇵🇱', name: 'Poland' },
  { value: '🇵🇹', name: 'Portugal' },
  { value: '🇵🇷', name: 'Puerto Rico' },
  { value: '🇶🇦', name: 'Qatar' },
  { value: '🏳️‍🌈', name: 'Rainbow' },
  { value: '🇷🇪', name: 'Réunion' },
  { value: '🇷🇴', name: 'Romania' },
  { value: '🇷🇸', name: 'Serbia' },
  { value: '🇷🇺', name: 'Russia' },
  { value: '🇷🇼', name: 'Rwanda' },
  { value: '🇧🇱', name: 'St. Barthélemy' },
  { value: '🇸🇭', name: 'St. Helena' },
  { value: '🇰🇳', name: 'St. Kitts & Nevis' },
  { value: '🇱🇨', name: 'St. Lucia' },
  { value: '🇲🇫', name: 'St. Martin' },
  { value: '🇵🇲', name: 'St. Pierre & Miquelon' },
  { value: '🇻🇨', name: 'St. Vincent & Grenadines' },
  { value: '🇼🇸', name: 'Samoa' },
  { value: '🇸🇲', name: 'San Marino' },
  { value: '🇸🇹', name: 'São Tomé & Príncipe' },
  { value: '🇸🇦', name: 'Saudi Arabia' },
  { value: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', name: 'Scotland' },
  { value: '🇸🇳', name: 'Senegal' },
  { value: '🇸🇨', name: 'Seychelles' },
  { value: '🇸🇱', name: 'Sierra Leone' },
  { value: '🇸🇬', name: 'Singapore' },
  { value: '🇸🇽', name: 'Sint Maarten' },
  { value: '🇸🇰', name: 'Slovakia' },
  { value: '🇸🇮', name: 'Slovenia' },
  { value: '🇸🇧', name: 'Solomon Islands' },
  { value: '🇸🇴', name: 'Somalia' },
  { value: '🇿🇦', name: 'South Africa' },
  { value: '🇬🇸', name: 'South Georgia & South Sandwich Islands' },
  { value: '🇰🇷', name: 'South Korea' },
  { value: '🇸🇸', name: 'South Sudan' },
  { value: '🇪🇸', name: 'Spain' },
  { value: '🇱🇰', name: 'Sri Lanka' },
  { value: '🇸🇩', name: 'Sudan' },
  { value: '🇸🇷', name: 'Suriname' },
  { value: '🇸🇯', name: 'Svalbard & Jan Mayen' },
  { value: '🇸🇿', name: 'Eswatini' },
  { value: '🇸🇪', name: 'Sweden' },
  { value: '🇨🇭', name: 'Switzerland' },
  { value: '🇸🇾', name: 'Syria' },
  { value: '🇹🇼', name: 'Taiwan' },
  { value: '🇹🇯', name: 'Tajikistan' },
  { value: '🇹🇿', name: 'Tanzania' },
  { value: '🇹🇭', name: 'Thailand' },
  { value: '🇹🇱', name: 'Timor-Leste' },
  { value: '🇹🇬', name: 'Togo' },
  { value: '🇹🇰', name: 'Tokelau' },
  { value: '🇹🇴', name: 'Tonga' },
  { value: '🚩', name: 'Triangular' },
  { value: '🇹🇦', name: 'Tristan da Cunha' },
  { value: '🇹🇹', name: 'Trinidad & Tobago' },
  { value: '🇹🇳', name: 'Tunisia' },
  { value: '🇹🇷', name: 'Turkey' },
  { value: '🇹🇲', name: 'Turkmenistan' },
  { value: '🇹🇨', name: 'Turks & Caicos Islands' },
  { value: '🇹🇻', name: 'Tuvalu' },
  { value: '🇺🇬', name: 'Uganda' },
  { value: '🇺🇦', name: 'Ukraine' },
  { value: '🇦🇪', name: 'United Arab Emirates' },
  { value: '🇬🇧', name: 'United Kingdom' },
  { value: '🇺🇳', name: 'United Nations' },
  { value: '🇺🇸', name: 'United States' },
  { value: '🇺🇲', name: 'U.S. Outlying Islands' },
  { value: '🇺🇾', name: 'Uruguay' },
  { value: '🇺🇿', name: 'Uzbekistan' },
  { value: '🇻🇺', name: 'Vanuatu' },
  { value: '🇻🇦', name: 'Vatican City' },
  { value: '🇻🇪', name: 'Venezuela' },
  { value: '🇻🇳', name: 'Vietnam' },
  { value: '🇻🇮', name: 'U.S. Virgin Islands' },
  { value: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', name: 'Wallis & Futuna' },
  { value: '🇼🇫', name: 'Wallis & Futuna' },
  { value: '🇪🇭', name: 'Western Sahara' },
  { value: '🏳', name: 'White' },
  { value: '🇾🇪', name: 'Yemen' },
  { value: '🇿🇲', name: 'Zambia' },
  { value: '🇿🇼', name: 'Zimbabwe' },
];

export const flagValues = new Set(flags.map(f => f.value.normalize('NFC')));

// A small set of common emojis for quick selection, excluding flags
// This current implementation relies on basic string matching for emoji descriptions.
export const generalEmojis: { value: string; name: string }[] = [
  // Faces
  { value: '😀', name: 'Grinning Face' }, { value: '😊', name: 'Smiling Face with Smiling Eyes' },
  { value: '😎', name: 'Smiling Face with Sunglasses' }, { value: '😇', name: 'Smiling Face with Halo' },
  { value: '🤓', name: 'Nerd Face' }, { value: '🥳', name: 'Partying Face' },
  { value: '🤔', name: 'Thinking Face' }, { value: '😐', name: 'Neutral Face' },
  { value: '😞', name: 'Disappointed Face' }, { value: '😠', name: 'Angry Face' },
  { value: '😢', name: 'Crying Face' }, { value: '😭', name: 'Loudly Crying Face' },
  { value: '🤯', name: 'Exploding Head' }, { value: '🥺', name: 'Pleading Face' },
  { value: '😷', name: 'Face with Medical Mask' }, { value: '🤖', name: 'Robot' },

  // Network/Access related
  { value: '📶', name: 'Antenna Bars' }, { value: '📡', name: 'Satellite Antenna' },
  { value: '🔗', name: 'Link' }, { value: '🔓', name: 'Unlocked' },
  { value: '🔒', name: 'Locked' }, { value: '🔑', name: 'Key' },
  { value: '🚫', name: 'No Entry' }, { value: '✅', name: 'Check Mark Button' },
  { value: '❌', name: 'Cross Mark' }, { value: '🛑', name: 'Stop Sign' },

  // Safety/Security related
  { value: '🚨', name: 'Police Car Light' }, { value: '🛡️', name: 'Shield' },
  { value: '🚸', name: 'Children Crossing' }, { value: '👶', name: 'Baby' },
  { value: '👪', name: 'Family' }, { value: '🏠', name: 'House' },
  { value: '🏫', name: 'School' }, { value: '🏥', name: 'Hospital' },

  // Other common
  { value: '👍', name: 'Thumbs Up' }, { value: '👎', name: 'Thumbs Down' },
  { value: '👏', name: 'Clapping Hands' }, { value: '🙌', name: 'Raising Hands' },
  { value: '🙏', name: 'Folded Hands' }, { value: '💪', name: 'Flexed Biceps' },
  { value: '🔥', name: 'Fire' }, { value: '✨', name: 'Sparkles' },
  { value: '🎉', name: 'Party Popper' }, { value: '💯', name: 'Hundred Points' },
  { value: '❤️', name: 'Red Heart' }, { value: '🧡', name: 'Orange Heart' },
  { value: '💛', name: 'Yellow Heart' }, { value: '💚', name: 'Green Heart' },
  { value: '💙', name: 'Blue Heart' }, { value: '💜', name: 'Purple Heart' },
  { value: '🖤', name: 'Black Heart' }, { value: '🤍', name: 'White Heart' },
  { value: '🤎', name: 'Brown Heart' }, { value: '💔', name: 'Broken Heart' },
  { value: '💡', name: 'Light Bulb' }, { value: '📚', name: 'Books' },
  { value: '💻', name: 'Laptop' }, { value: '📱', name: 'Mobile Phone' },
  { value: '🌐', name: 'Globe with Meridians' }, { value: '⚙️', name: 'Gear' },
  { value: '🚀', name: 'Rocket' }, { value: '✈️', name: 'Airplane' },
  { value: '🚢', name: 'Ship' }, { value: '🚗', name: 'Automobile' },
  { value: '🌳', name: 'Deciduous Tree' }, { value: '🌸', name: 'Cherry Blossom' },
  { value: '☀️', name: 'Sun' }, { value: '🌧️', name: 'Cloud with Rain' },
  { value: '⚡', name: 'High Voltage' }, { value: '❄️', name: 'Snowflake' },
  { value: '🌍', name: 'Earth Globe Europe-Africa' }, { value: '🌕', name: 'Full Moon' },
  { value: '⭐', name: 'Star' }, { value: '🌈', name: 'Rainbow' },
  { value: '🐶', name: 'Dog' }, { value: '🐱', name: 'Cat' },
  { value: '🐵', name: 'Monkey' }, { value: '🦄', name: 'Unicorn' },
  { value: '🍔', name: 'Hamburger' }, { value: '⚽️', name: 'Soccer Ball' },
  { value: '🍕', name: 'Slice of Pizza' }, { value: '🎨', name: 'Artist Palette' },
  { value: '🎵', name: 'Musical Note' }, { value: '🎶', name: 'Musical Notes' },
  { value: '🎬', name: 'Clapper Board' },
];

export const generalEmojiValues = new Set(generalEmojis.map(e => e.value.normalize('NFC')));

// Define types for emoji and flag items

type EmojiItem = { value: string; name: string; emoji?: string };
type FlagItem = { value: string; name: string; flag?: string };

type EmojiOrCustom = EmojiItem;
type FlagOrCustom = FlagItem;

interface IconPickerProps {
  value?: string | null; // Current icon identifier (emoji or Lucide icon name)
  onChange: (iconIdentifier: string | null) => void;
  additionalLucideIcons?: { name: string; icon: LucideIcon }[];
  additionalEmojis?: { value: string; name: string }[];
  additionalFlags?: { value: string; name: string }[];
}

const IconPickerInner: React.FC<IconPickerProps> = ({ value, onChange, additionalLucideIcons, additionalEmojis, additionalFlags }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'emojis' | 'flags' | 'icons'>('emojis');

  const handleSelectIcon = useCallback((icon: string) => {
    onChange(icon);
    setIsOpen(false);
    setSearchQuery(''); // Clear search when an icon is selected
  }, [onChange]);

  const handleClearIcon = useCallback(() => {
    onChange(null);
    setIsOpen(false);
    setSearchQuery('');
  }, [onChange]);

  const filteredLucideIcons = useMemo(() => {
    const allLucideIcons = [...curatedLucideIcons, ...(additionalLucideIcons || [])];
    if (!searchQuery) return allLucideIcons;
    const lowerCaseQuery = searchQuery.toLowerCase();
    return allLucideIcons.filter(icon =>
      icon.name.toLowerCase().includes(lowerCaseQuery)
    );
  }, [searchQuery, additionalLucideIcons]);

  const filteredEmojis = useMemo(() => {
    const allEmojis: EmojiOrCustom[] = [...generalEmojis, ...(additionalEmojis || [])];
    if (!searchQuery) return allEmojis;
    const lowerCaseQuery = searchQuery.toLowerCase();
    return allEmojis.filter(item =>
      item.name.toLowerCase().includes(lowerCaseQuery) || item.emoji?.includes(lowerCaseQuery) || item.value?.includes(lowerCaseQuery)
    );
  }, [searchQuery, additionalEmojis]);

  const filteredFlags = useMemo(() => {
    const allFlags: FlagOrCustom[] = [...flags, ...(additionalFlags || [])];
    if (!searchQuery) return allFlags;
    const lowerCaseQuery = searchQuery.toLowerCase();
    return allFlags.filter(item =>
      item.name.toLowerCase().includes(lowerCaseQuery) || item.flag?.includes(lowerCaseQuery) || item.value?.includes(lowerCaseQuery)
    );
  }, [searchQuery, additionalFlags]);

  const renderSelectedIcon = () => {
    if (!value) {
      return <LucideIcons.Network size={18} className="text-muted-foreground" />;
    }

    const allEmojis: EmojiOrCustom[] = [...generalEmojis, ...(additionalEmojis || [])];
    const allFlags: FlagOrCustom[] = [...flags, ...(additionalFlags || [])];

    // Check if it's a general emoji or custom emoji
    if (allEmojis.some(item => item.emoji === value || item.value === value)) {
      return <span className="text-xl leading-none">{value}</span>;
    }

    // Check if it's a flag or custom flag
    if (allFlags.some(item => item.flag === value || item.value === value)) {
      return <span className="text-xl leading-none">{value}</span>;
    }

    // Assume it's a Lucide icon name (either curated or additional)
    const IconComponent = LucideIcons[value as keyof typeof LucideIcons] as LucideIcon | undefined;
    if (IconComponent) {
      return <IconComponent size={18} className="text-primary" />;
    }

    // Fallback if not recognized
    return <LucideIcons.Network size={18} className="text-muted-foreground" />;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center justify-center h-9 w-9 p-0"
          aria-label={value ? `Selected icon: ${value}` : "Select icon"}
        >
          {renderSelectedIcon()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="p-2">
          <Input
            placeholder={activeTab === 'emojis' ? "Search emojis..." : activeTab === 'flags' ? "Search flags..." : "Search icons..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-2"
          />
        </div>
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'emojis' | 'flags' | 'icons')} className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-none border-b">
            <TabsTrigger value="emojis">Emojis</TabsTrigger>
            <TabsTrigger value="flags">Flags</TabsTrigger>
            <TabsTrigger value="icons">Icons</TabsTrigger>
          </TabsList>
          <TabsContent value="emojis" className="mt-0">
            <ScrollArea className="h-60 p-2">
              <div className="grid grid-cols-8 gap-1">
                {filteredEmojis.map((item, index) => (
                  <TooltipProvider key={index}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-xl h-8 w-8"
                          onClick={() => handleSelectIcon(item.emoji || item.value)}
                          aria-label={item.name}
                        >
                          {item.emoji || item.value}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{item.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
              {filteredEmojis.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">No emojis found.</p>
              )}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="flags" className="mt-0">
            <ScrollArea className="h-60 p-2">
              <div className="grid grid-cols-8 gap-1">
                {filteredFlags.map((item, index) => (
                  <TooltipProvider key={index}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-xl h-8 w-8"
                          onClick={() => handleSelectIcon(item.flag || item.value)}
                          aria-label={item.name}
                        >
                          {item.flag || item.value}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{item.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
              {filteredFlags.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">No flags found.</p>
              )}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="icons" className="mt-0">
            <ScrollArea className="h-60 p-2">
              <div className="grid grid-cols-5 gap-1">
                {filteredLucideIcons.map((icon, index) => {
                  const IconComponent = icon.icon;
                  return (
                    <TooltipProvider key={index}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleSelectIcon(icon.name)}
                            aria-label={icon.name}
                          >
                            <IconComponent size={18} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{icon.name}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
              {filteredLucideIcons.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">No icons found.</p>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
        <div className="p-2 border-t">
          <Button variant="outline" onClick={handleClearIcon} className="w-full">
            Clear Icon
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const IconPicker = React.memo(IconPickerInner);
