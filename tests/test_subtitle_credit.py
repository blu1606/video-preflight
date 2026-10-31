import unittest

from sources.extractor import clean_transcript, is_subtitle_credit


class SubtitleCreditTest(unittest.TestCase):
    def test_known_credit_lines_are_recognised(self):
        self.assertTrue(is_subtitle_credit("자막제작 by UpTitle http://www.uptitle.co.kr"))
        self.assertTrue(is_subtitle_credit("Subtitles by the Amara.org community"))
        self.assertTrue(is_subtitle_credit("Hãy subscribe cho kênh Ghiền Mì Gõ để không bỏ lỡ"))
        self.assertFalse(is_subtitle_credit("Ốp lưng sọc hồng chỉ 26 nghìn"))

    def test_credit_segments_leave_text_and_segments(self):
        segs = [{"start": 0, "end": 2, "text": "Ốp lưng xinh quá"}, {"start": 8, "end": 10, "text": "자막제작 by UpTitle"}]
        text, kept = clean_transcript("Ốp lưng xinh quá 자막제작 by UpTitle", segs)
        self.assertEqual(text, "Ốp lưng xinh quá")
        self.assertEqual([s["start"] for s in kept], [0])

    def test_music_only_cache_ends_with_no_speech(self):
        text, kept = clean_transcript("자막제작 by UpTitle http://www.uptitle.co.kr",
                                      [{"start": 0, "end": 3, "text": "자막제작 by UpTitle http://www.uptitle.co.kr"}])
        self.assertEqual((text, kept), ("", []))

    def test_clean_transcript_is_untouched(self):
        segs = [{"start": 0, "end": 2, "text": "Xin chào"}]
        self.assertEqual(clean_transcript("Xin chào", segs), ("Xin chào", segs))
        self.assertEqual(clean_transcript(None, None), ("", []))


if __name__ == "__main__":
    unittest.main()
