#[derive(serde::Serialize)]
pub struct SpellingRange {
    pub from: usize,
    pub to: usize,
}

#[tauri::command]
pub fn misspellings(text: String) -> Vec<SpellingRange> {
    misspelled_ranges(&text)
}

#[tauri::command]
pub fn spelling_suggestions(word: String) -> Vec<String> {
    suggestions_for(&word)
}

#[cfg(target_os = "macos")]
fn misspelled_ranges(text: &str) -> Vec<SpellingRange> {
    use objc2_app_kit::NSSpellChecker;
    use objc2_foundation::NSString;

    if text.is_empty() {
        return Vec::new();
    }
    let checker = NSSpellChecker::sharedSpellChecker();
    let ns = NSString::from_str(text);
    let total = ns.length();
    let mut start = 0isize;
    let mut found = Vec::new();
    let not_found = isize::MAX as usize;
    while (start as usize) < total {
        let range = unsafe {
            checker.checkSpellingOfString_startingAt_language_wrap_inSpellDocumentWithTag_wordCount(
                &ns,
                start,
                None,
                false,
                0,
                std::ptr::null_mut(),
            )
        };
        if range.location == not_found || range.location >= total || range.length == 0 {
            break;
        }
        let end = range.location + range.length;
        if end <= range.location || end > total {
            break;
        }
        found.push(SpellingRange {
            from: range.location,
            to: end,
        });
        start = end as isize;
    }
    found
}

#[cfg(target_os = "macos")]
fn suggestions_for(word: &str) -> Vec<String> {
    use objc2_app_kit::NSSpellChecker;
    use objc2_foundation::{NSRange, NSString};

    if word.is_empty() {
        return Vec::new();
    }
    let checker = NSSpellChecker::sharedSpellChecker();
    let ns = NSString::from_str(word);
    let Some(guesses) = checker.guessesForWordRange_inString_language_inSpellDocumentWithTag(
        NSRange::new(0, ns.length()),
        &ns,
        None,
        0,
    ) else {
        return Vec::new();
    };
    let mut words = Vec::new();
    let lower = word.to_lowercase();
    for index in 0..guesses.count() {
        if words.len() == 8 {
            break;
        }
        let guess = guesses.objectAtIndex(index).to_string();
        if guess.to_lowercase() == lower || words.contains(&guess) {
            continue;
        }
        words.push(guess);
    }
    words
}

#[cfg(not(target_os = "macos"))]
fn misspelled_ranges(_text: &str) -> Vec<SpellingRange> {
    Vec::new()
}

#[cfg(not(target_os = "macos"))]
fn suggestions_for(_word: &str) -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::misspelled_ranges;

    #[test]
    fn an_empty_line_has_no_misspellings() {
        assert!(misspelled_ranges("").is_empty());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_made_up_word_is_marked_and_a_real_one_is_not() {
        let text = "The brekfast was fine.";
        let units: Vec<u16> = text.encode_utf16().collect();
        let missed: Vec<String> = misspelled_ranges(text)
            .into_iter()
            .map(|range| String::from_utf16(&units[range.from..range.to]).unwrap())
            .collect();
        assert!(missed.contains(&"brekfast".to_string()), "{missed:?}");
        assert!(!missed.iter().any(|word| word == "fine"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_misspelling_offers_the_real_word() {
        let guesses = super::suggestions_for("brekfast");
        assert!(
            guesses.iter().any(|word| word.eq_ignore_ascii_case("breakfast")),
            "{guesses:?}"
        );
    }
}
