<?php

namespace Tests\Unit;

use App\Support\PhoneNumber;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class PhoneNumberTest extends TestCase
{
    /**
     * @return array<string, array{0: string, 1: string|null}>
     */
    public static function numbers(): array
    {
        return [
            'local with leading zero' => ['0300 1234567', '+923001234567'],
            'local without zero' => ['3001234567', '+923001234567'],
            'already international' => ['+92 300 1234567', '+923001234567'],
            'dashes and brackets' => ['(0300)-123-4567', '+923001234567'],
            'another country' => ['+44 20 7946 0958', '+442079460958'],
            'too short' => ['12345', null],
            'letters' => ['0300-abcdefg', null],
            'too long' => ['+9230012345678901234', null],
            'empty' => ['', null],
        ];
    }

    #[DataProvider('numbers')]
    public function test_a_number_is_stored_in_one_international_form(string $typed, ?string $expected)
    {
        $this->assertSame($expected, PhoneNumber::normalize($typed, '+92'));
    }

    public function test_a_search_text_loses_its_leading_zero_and_everything_but_digits()
    {
        $this->assertSame('300123', PhoneNumber::searchDigits('0300 123'));
        $this->assertSame('', PhoneNumber::searchDigits('Ali'));
    }
}
